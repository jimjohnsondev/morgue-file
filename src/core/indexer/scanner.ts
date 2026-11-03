// One-shot scan of a root: adds new files, updates changed ones, marks vanished ones missing, and
// queues their thumbnails (docs/ARCHITECTURE.md, Indexing step 2). The watcher (PR 11) runs the
// same comparison for one path at a time.
import { isReferenceFolderPresent } from '#core/archive/originals.js';
import {
  clearItemMissing,
  findScanStates,
  markItemMissing,
  updateItemFile,
} from '#core/db/repositories/item-files.js';
import { insertItem } from '#core/db/repositories/items.js';
import { markRootScanned, setRootStatus } from '#core/db/repositories/roots.js';
import { queueThumbnail } from '#core/jobs/thumbnail-jobs.js';

import { walkRoot } from './walk.js';

import type { Db } from '#core/db/connection.js';
import type { ScanState } from '#core/db/repositories/item-files.js';
import type { ItemKind } from '#core/db/repositories/items.js';
import type { FoundEntry } from './walk.js';

/** Rows written per transaction, so a long scan never holds the write lock for long. */
const BATCH_SIZE = 500;

/** Background work: below anything a page or a drop asks for. */
const SCAN_PRIORITY = 2;

/** Which root to scan, and the clock (tests fix it). */
export type ScanOptions = {
  readonly db: Db;
  readonly rootId: number;
  readonly rootPath: string;
  readonly now?: () => Date;
  /** Stops the scan between entries when the server shuts down. */
  readonly signal?: AbortSignal;
  /** Called after each batch is written, so thumbnails start before a long scan ends. */
  readonly onBatchWritten?: () => void;
};

/** What a scan did, for the scan log. An offline root is left exactly as it was. */
export type ScanSummary = {
  readonly isOffline: boolean;
  readonly added: number;
  readonly changed: number;
  readonly unchanged: number;
  readonly missing: number;
  /** Files of no known format, which the archive leaves out. */
  readonly ignored: number;
  readonly unreadableFolders: number;
};

/** A found entry that needs a write, and the stored item it matched, if any. */
type Change = { readonly entry: IndexedEntry; readonly stored: ScanState | undefined };

/** A found entry the archive keeps, as opposed to an ignored file or unreadable folder. */
type IndexedEntry = FoundEntry & { readonly kind: ItemKind };

/** What a scan learns as it walks, before missing items are worked out. */
type WalkTally = {
  added: number;
  changed: number;
  unchanged: number;
  ignored: number;
  /** Folded paths found so far, so a second file whose name differs only in case is skipped. */
  readonly seenPaths: Set<string>;
  readonly unreadableFolders: string[];
};

/** What one found entry needs: a write, a found-again mark, or nothing. */
type EntryOutcome = { readonly change?: Change; readonly foundAgainId?: number };

/**
 * Folds ASCII letters to lower case and leaves the rest, matching SQLite's NOCASE on rel_path,
 * so a path matches its stored item exactly when the database would say it does.
 */
function foldPathCase(relPath: string): string {
  return relPath.replaceAll(/[A-Z]/g, (letter) => letter.toLowerCase());
}

/** Says whether a file's size or time differs from what was stored, so it must be re-read. */
function hasChanged(stored: ScanState, entry: FoundEntry): boolean {
  return stored.size !== entry.size || stored.mtimeMs !== entry.mtimeMs;
}

/**
 * When a newly found file counts as added: its own time, so a first index lists an archive
 * newest first by file date rather than in the order the scan walked it. A file dated in the
 * future counts as added now.
 */
function addedAtFor(entry: FoundEntry, now: Date): string {
  return new Date(Math.min(entry.mtimeMs, now.getTime())).toISOString();
}

/** The scan's settings with the clock read once, so one scan stamps one time. */
type ScanRun = {
  readonly db: Db;
  readonly rootId: number;
  readonly rootPath: string;
  readonly now: Date;
  readonly signal?: AbortSignal | undefined;
  readonly onBatchWritten?: (() => void) | undefined;
};

/** Writes one batch of changes in one transaction, queuing a thumbnail for each. */
function writeChanges(scan: ScanRun, changes: readonly Change[]): void {
  const { db } = scan;
  const now = scan.now.toISOString();
  db.transaction(() => {
    for (const { entry, stored } of changes) {
      let itemId = stored?.id;
      if (itemId === undefined) {
        itemId = insertItem(db, {
          rootId: scan.rootId,
          relPath: entry.relPath,
          kind: entry.kind,
          size: entry.size,
          mtimeMs: entry.mtimeMs,
          addedAt: addedAtFor(entry, scan.now),
        });
      } else {
        updateItemFile(db, { id: itemId, size: entry.size, mtimeMs: entry.mtimeMs });
      }
      queueThumbnail(db, { itemId, kind: entry.kind, priority: SCAN_PRIORITY, now });
    }
  })();
}

/** Writes items found again unchanged after being missing. */
function writeFoundAgain(db: Db, ids: readonly number[]): void {
  db.transaction(() => {
    for (const id of ids) {
      clearItemMissing(db, id);
    }
  })();
}

/** Tallies one found entry and says what it needs written. */
function recordEntry(
  tally: WalkTally,
  known: ReadonlyMap<string, ScanState>,
  entry: FoundEntry,
): EntryOutcome {
  const foldedPath = foldPathCase(entry.relPath);
  if (entry.kind === 'unreadable-folder') {
    tally.unreadableFolders.push(foldedPath);
    return {};
  }
  if (entry.kind === 'ignored' || tally.seenPaths.has(foldedPath)) {
    tally.ignored += 1;
    return {};
  }
  tally.seenPaths.add(foldedPath);
  // Copied so its type records that the kind is now an item kind.
  const indexed = { ...entry, kind: entry.kind };
  const stored = known.get(foldedPath);
  if (stored === undefined) {
    tally.added += 1;
    return { change: { entry: indexed, stored } };
  }
  if (hasChanged(stored, entry)) {
    tally.changed += 1;
    return { change: { entry: indexed, stored } };
  }
  tally.unchanged += 1;
  return stored.isMissing ? { foundAgainId: stored.id } : {};
}

/** Walks the root, comparing each entry with the stored items and writing the differences. */
async function walkAndWrite(
  scan: ScanRun,
  known: ReadonlyMap<string, ScanState>,
): Promise<WalkTally> {
  const tally: WalkTally = {
    added: 0,
    changed: 0,
    unchanged: 0,
    ignored: 0,
    seenPaths: new Set(),
    unreadableFolders: [],
  };
  let changes: Change[] = [];
  let foundAgain: number[] = [];
  function flush(): void {
    writeChanges(scan, changes);
    writeFoundAgain(scan.db, foundAgain);
    changes = [];
    foundAgain = [];
    scan.onBatchWritten?.();
  }
  for await (const entry of walkRoot(scan.rootPath)) {
    scan.signal?.throwIfAborted();
    const outcome = recordEntry(tally, known, entry);
    if (outcome.change !== undefined) {
      changes.push(outcome.change);
    }
    if (outcome.foundAgainId !== undefined) {
      foundAgain.push(outcome.foundAgainId);
    }
    if (changes.length + foundAgain.length >= BATCH_SIZE) {
      flush();
    }
  }
  flush();
  return tally;
}

/**
 * Says whether a path is a folder the scan couldn't read (a page folder) or sits inside one;
 * nothing there can be called missing.
 */
function isInUnreadableFolder(foldedPath: string, unreadableFolders: readonly string[]): boolean {
  return unreadableFolders.some(
    (folder) => foldedPath === folder || foldedPath.startsWith(`${folder}/`),
  );
}

/** Marks every stored item the walk didn't see as missing, and returns how many it marked. */
function markUnseenMissing(
  scan: ScanRun,
  known: ReadonlyMap<string, ScanState>,
  tally: WalkTally,
): number {
  const unseen = [...known.entries()].filter(
    ([foldedPath, stored]) =>
      !stored.isMissing &&
      !tally.seenPaths.has(foldedPath) &&
      !isInUnreadableFolder(foldedPath, tally.unreadableFolders),
  );
  const now = scan.now.toISOString();
  for (let start = 0; start < unseen.length; start += BATCH_SIZE) {
    scan.db.transaction(() => {
      for (const [, stored] of unseen.slice(start, start + BATCH_SIZE)) {
        markItemMissing(scan.db, stored.id, now);
      }
    })();
  }
  return unseen.length;
}

/**
 * Scans a root once and brings its items up to date. If the root's folder isn't there, the root
 * is marked offline and nothing else changes, so an unplugged drive never marks items missing.
 */
export async function scanRoot(options: ScanOptions): Promise<ScanSummary> {
  const scan: ScanRun = { ...options, now: (options.now ?? (() => new Date()))() };
  if (!(await isReferenceFolderPresent(scan.rootPath))) {
    setRootStatus(scan.db, scan.rootId, 'offline');
    return {
      isOffline: true,
      added: 0,
      changed: 0,
      unchanged: 0,
      missing: 0,
      ignored: 0,
      unreadableFolders: 0,
    };
  }
  const stored = findScanStates(scan.db, scan.rootId);
  const known = new Map(stored.map((state) => [foldPathCase(state.relPath), state]));
  const tally = await walkAndWrite(scan, known);
  const missing = markUnseenMissing(scan, known, tally);
  markRootScanned(scan.db, scan.rootId, scan.now.toISOString());
  return {
    isOffline: false,
    added: tally.added,
    changed: tally.changed,
    unchanged: tally.unchanged,
    missing,
    ignored: tally.ignored,
    unreadableFolders: tally.unreadableFolders.length,
  };
}
