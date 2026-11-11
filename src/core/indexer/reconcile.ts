// Compares what a walk finds with the stored items and writes the difference: new files get an
// item and a thumbnail job, changed ones are updated and requeued, moved ones are re-pointed and
// unseen ones are marked missing (docs/ARCHITECTURE.md, Indexing steps 2 to 4). The full scan and
// the watcher's partial scans share it, so a file is judged the same way by both.
import {
  clearItemMissing,
  findUnattachedItemIds,
  markItemMissing,
  removeItems,
  updateItemFile,
} from '#core/db/repositories/item-files.js';
import { findItemByPath, insertItem, moveItem } from '#core/db/repositories/items.js';
import { queueThumbnail } from '#core/jobs/thumbnail-jobs.js';

import { createMovePool } from './moves.js';

import type { Db } from '#core/db/connection.js';
import type { ScanState } from '#core/db/repositories/item-files.js';
import type { ItemKind } from '#core/db/repositories/items.js';
import type { MovePool } from './moves.js';
import type { FoundEntry } from './walk.js';

/** Rows written per transaction, so a long scan never holds the write lock for long. */
const BATCH_SIZE = 500;

/** Background work: below anything a page or a drop asks for. */
const SCAN_PRIORITY = 2;

/** One pass over part or all of a root, with the clock read once, so one pass stamps one time. */
export type ReconcileRun = {
  readonly db: Db;
  readonly rootId: number;
  readonly rootPath: string;
  readonly now: Date;
  /** Stops the pass between entries when the server shuts down. */
  readonly signal?: AbortSignal | undefined;
  /** Called after each batch is written, so thumbnails start before a long scan ends. */
  readonly onBatchWritten?: (() => void) | undefined;
  /** Holds the pass between entries while indexing is paused (E5). */
  readonly waitWhilePaused?: (() => Promise<void>) | undefined;
};

/** What a pass did, for the scan log. */
export type ReconcileSummary = {
  readonly added: number;
  readonly changed: number;
  readonly unchanged: number;
  /** New paths recognized as items that moved there, which keep everything attached to them. */
  readonly moved: number;
  readonly missing: number;
  /** Photos removed because their folder is now one page-folder item (a publication). */
  readonly absorbed: number;
  /** Files of no known format, which the archive leaves out. */
  readonly ignored: number;
  readonly unreadableFolders: number;
};

/** A found entry the archive keeps, as opposed to an ignored file or unreadable folder. */
type IndexedEntry = FoundEntry & { readonly kind: ItemKind };

/** A found entry that needs a write, and the stored item it matched, if any. */
type Change = { readonly entry: IndexedEntry; readonly stored: ScanState | undefined };

/** What a pass learns as it walks, before moves and missing items are worked out. */
type WalkTally = {
  added: number;
  changed: number;
  unchanged: number;
  moved: number;
  ignored: number;
  /** Folded paths found so far, so a second file whose name differs only in case is skipped. */
  readonly seenPaths: Set<string>;
  /** Folded paths of the page folders found, whose pages can't also be photos. */
  readonly pageFolders: Set<string>;
  readonly unreadableFolders: string[];
  /** New entries held back until the walk ends, since each may be an item moved there. */
  readonly maybeMoved: IndexedEntry[];
};

/** What one found entry needs: a write, a found-again mark, or nothing. */
type EntryOutcome = { readonly change?: Change; readonly foundAgainId?: number };

/**
 * Folds ASCII letters to lower case and leaves the rest, matching SQLite's NOCASE on rel_path,
 * so a path matches its stored item exactly when the database would say it does.
 */
export function foldPathCase(relPath: string): string {
  return relPath.replaceAll(/[A-Z]/g, (letter) => letter.toLowerCase());
}

/** Says whether a file's size or time differs from what was stored, so it must be re-read. */
function hasChanged(stored: Pick<ScanState, 'size' | 'mtimeMs'>, entry: FoundEntry): boolean {
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

/** Writes one batch of changes in one transaction, queuing a thumbnail for each. */
function writeChanges(run: ReconcileRun, changes: readonly Change[]): void {
  const { db } = run;
  const now = run.now.toISOString();
  db.transaction(() => {
    for (const { entry, stored } of changes) {
      // Ingest indexes a saved file at once, so another pass that listed the folder before then
      // may find its item already stored; update it rather than adding the path twice, and leave
      // it alone if ingest stored it as it is now, so its thumbnail isn't made twice.
      const current = stored ?? findItemByPath(db, run.rootId, entry.relPath);
      if (stored === undefined && current !== undefined && !hasChanged(current, entry)) {
        continue;
      }
      let itemId = current?.id;
      if (itemId === undefined) {
        itemId = insertItem(db, {
          rootId: run.rootId,
          relPath: entry.relPath,
          kind: entry.kind,
          size: entry.size,
          mtimeMs: entry.mtimeMs,
          addedAt: addedAtFor(entry, run.now),
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
  context: { readonly known: ReadonlyMap<string, ScanState>; readonly moves: MovePool },
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
  if (entry.kind === 'pagefolder') {
    tally.pageFolders.add(foldedPath);
  }
  // Copied so its type records that the kind is now an item kind.
  const indexed = { ...entry, kind: entry.kind };
  const stored = context.known.get(foldedPath);
  if (stored === undefined && context.moves.mightMatch(indexed)) {
    tally.maybeMoved.push(indexed);
    return {};
  }
  if (stored === undefined) {
    tally.added += 1;
    return { change: { entry: indexed, stored } };
  }
  if (hasChanged(stored, entry)) {
    tally.changed += 1;
    return { change: { entry: indexed, stored } };
  }
  tally.unchanged += 1;
  return stored.missingSince === undefined ? {} : { foundAgainId: stored.id };
}

/** A tally with nothing counted yet. */
function emptyTally(): WalkTally {
  return {
    added: 0,
    changed: 0,
    unchanged: 0,
    moved: 0,
    ignored: 0,
    seenPaths: new Set(),
    pageFolders: new Set(),
    unreadableFolders: [],
    maybeMoved: [],
  };
}

/** Walks the entries, comparing each with the stored items and writing the differences. */
async function walkAndWrite(
  run: ReconcileRun,
  entries: AsyncIterable<FoundEntry> | Iterable<FoundEntry>,
  context: { readonly known: ReadonlyMap<string, ScanState>; readonly moves: MovePool },
): Promise<WalkTally> {
  const tally = emptyTally();
  let changes: Change[] = [];
  let foundAgain: number[] = [];
  function flush(): void {
    writeChanges(run, changes);
    writeFoundAgain(run.db, foundAgain);
    changes = [];
    foundAgain = [];
    run.onBatchWritten?.();
  }
  for await (const entry of entries) {
    run.signal?.throwIfAborted();
    await run.waitWhilePaused?.();
    const outcome = recordEntry(tally, context, entry);
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
 * Settles the entries held back as possible moves: each one that matches a missing or unseen
 * item re-points that item, and the rest are added as new items.
 */
async function settleMoves(run: ReconcileRun, tally: WalkTally, moves: MovePool): Promise<void> {
  function isSeen(state: ScanState): boolean {
    return tally.seenPaths.has(foldPathCase(state.relPath));
  }
  const added: Change[] = [];
  for (const entry of tally.maybeMoved) {
    const match = await moves.claimMatch(entry, isSeen);
    // A path ingest indexed during the pass is already an item; moving another onto it would
    // store the path twice.
    if (match === undefined || findItemByPath(run.db, run.rootId, entry.relPath) !== undefined) {
      added.push({ entry, stored: undefined });
      continue;
    }
    moveItem(run.db, { id: match.id, ...entry });
    // Seen now under its old path too, so it isn't marked missing below.
    tally.seenPaths.add(foldPathCase(match.relPath));
    tally.moved += 1;
  }
  tally.added += added.length;
  writeChanges(run, added);
}

/**
 * Says whether a path is a folder the walk couldn't read (a page folder) or sits inside one;
 * nothing there can be called missing.
 */
function isInUnreadableFolder(foldedPath: string, unreadableFolders: readonly string[]): boolean {
  return unreadableFolders.some(
    (folder) => foldedPath === folder || foldedPath.startsWith(`${folder}/`),
  );
}

/** Says whether an item is a photo in a folder that is now a page folder. */
function isInPageFolder(state: ScanState, pageFolders: ReadonlySet<string>): boolean {
  const foldedPath = foldPathCase(state.relPath);
  const folder = foldedPath.slice(0, Math.max(foldedPath.lastIndexOf('/'), 0));
  return state.kind === 'image' && pageFolders.has(folder);
}

/**
 * Splits the unseen items into photos to remove and items to mark missing. A photo whose folder
 * is now a page folder (system clutter that hid it is skipped, or the folder was made a
 * publication) is that publication's page, not a vanished file, so it is removed, but only with
 * nothing attached: a photo with tags, collections, models or notes stays, as a missing item, and
 * nothing Jim filed is lost.
 */
function splitUnseen(
  db: Db,
  unseen: readonly ScanState[],
  pageFolders: ReadonlySet<string>,
): { readonly absorbedIds: number[]; readonly missing: ScanState[] } {
  const pages = unseen.filter((state) => isInPageFolder(state, pageFolders));
  const absorbedIds = findUnattachedItemIds(
    db,
    pages.map((state) => state.id),
  );
  const absorbed = new Set(absorbedIds);
  return { absorbedIds, missing: unseen.filter((state) => !absorbed.has(state.id)) };
}

/** Marks the unseen items missing or removes absorbed page photos, and returns how many of each. */
function settleUnseen(
  run: ReconcileRun,
  stored: readonly ScanState[],
  tally: WalkTally,
): { readonly missing: number; readonly absorbed: number } {
  const unseen = stored.filter((state) => {
    const foldedPath = foldPathCase(state.relPath);
    return (
      state.missingSince === undefined &&
      !tally.seenPaths.has(foldedPath) &&
      !isInUnreadableFolder(foldedPath, tally.unreadableFolders)
    );
  });
  const { absorbedIds, missing } = splitUnseen(run.db, unseen, tally.pageFolders);
  removeItems(run.db, absorbedIds);
  const now = run.now.toISOString();
  for (let start = 0; start < missing.length; start += BATCH_SIZE) {
    run.db.transaction(() => {
      for (const state of missing.slice(start, start + BATCH_SIZE)) {
        markItemMissing(run.db, state.id, now);
      }
    })();
  }
  return { missing: missing.length, absorbed: absorbedIds.length };
}

/**
 * Brings the stored items in line with what a walk finds. `stored` must be exactly the items the
 * walk covers: any of them it doesn't find is marked missing.
 */
export async function reconcileEntries(
  run: ReconcileRun,
  entries: AsyncIterable<FoundEntry> | Iterable<FoundEntry>,
  stored: readonly ScanState[],
): Promise<ReconcileSummary> {
  const known = new Map(stored.map((state) => [foldPathCase(state.relPath), state]));
  const moves = createMovePool(run, stored);
  const tally = await walkAndWrite(run, entries, { known, moves });
  await settleMoves(run, tally, moves);
  const { missing, absorbed } = settleUnseen(run, stored, tally);
  run.onBatchWritten?.();
  return {
    added: tally.added,
    changed: tally.changed,
    unchanged: tally.unchanged,
    moved: tally.moved,
    missing,
    absorbed,
    ignored: tally.ignored,
    unreadableFolders: tally.unreadableFolders.length,
  };
}
