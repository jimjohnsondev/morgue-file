// Scans a root, or one part of it, and brings its items up to date through reconcile.ts. The
// startup scan walks the whole root (docs/ARCHITECTURE.md, Indexing step 2); the watcher scans
// the folder an event names (step 3).
import { isReferenceFolderPresent } from '#core/archive/originals.js';
import { findScanStates, findScanStatesUnder } from '#core/db/repositories/item-files.js';
import { markRootScanned, setRootStatus } from '#core/db/repositories/roots.js';
import { systemErrorCode } from '#core/errors.js';

import { reconcileEntries } from './reconcile.js';
import { walkRoot } from './walk.js';

import type { Db } from '#core/db/connection.js';
import type { ScanScope, ScanState } from '#core/db/repositories/item-files.js';
import type { ReconcileRun, ReconcileSummary } from './reconcile.js';
import type { FoundEntry } from './walk.js';

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
  /** Called as each folder is listed, with how many files it held, for the progress bar (E5). */
  readonly onFilesFound?: (fileCount: number) => void;
  /** Holds the scan between entries while indexing is paused (E5). */
  readonly waitWhilePaused?: () => Promise<void>;
};

/** What a scan did, for the scan log. An offline root is left exactly as it was. */
export type ScanSummary = ReconcileSummary & { readonly isOffline: boolean };

/** The summary of a scan that changed nothing: an offline root, or a folder it couldn't read. */
function untouched(isOffline: boolean): ScanSummary {
  return {
    isOffline,
    ...{ added: 0, changed: 0, unchanged: 0, moved: 0, missing: 0 },
    ...{ ignored: 0, unreadableFolders: 0 },
  };
}

/** The scan's settings with the clock read once. */
function startRun(options: ScanOptions): ReconcileRun {
  return { ...options, now: (options.now ?? (() => new Date()))() };
}

/**
 * Scans a root once and brings its items up to date. If the root's folder isn't there, the root
 * is marked offline and nothing else changes, so an unplugged drive never marks items missing.
 */
export async function scanRoot(options: ScanOptions): Promise<ScanSummary> {
  const run = startRun(options);
  if (!(await isReferenceFolderPresent(run.rootPath))) {
    setRootStatus(run.db, run.rootId, 'offline');
    return untouched(true);
  }
  const stored = findScanStates(run.db, run.rootId);
  const onFilesListed = options.onFilesFound;
  const walk = walkRoot(run.rootPath, onFilesListed === undefined ? {} : { onFilesListed });
  const summary = await reconcileEntries(run, walk, stored);
  markRootScanned(run.db, run.rootId, run.now.toISOString());
  return { isOffline: false, ...summary };
}

/** The parent folder of a path relative to a root; the root itself is ''. */
export function parentFolder(relPath: string): string {
  const slash = relPath.lastIndexOf('/');
  return slash === -1 ? '' : relPath.slice(0, slash);
}

/**
 * Says whether a stored item belongs to a partial scan. A shallow scan of a folder covers the
 * folder itself (as a page folder) and the files directly in it, but not a page folder inside
 * it, whose pages are that folder's own scan.
 */
function isInScope(state: ScanState, scope: ScanScope): boolean {
  if (!scope.isShallow || state.relPath.toLowerCase() === scope.relDir.toLowerCase()) {
    return true;
  }
  return (
    state.kind !== 'pagefolder' &&
    parentFolder(state.relPath).toLowerCase() === scope.relDir.toLowerCase()
  );
}

/** Says whether a failed listing means the folder is gone, rather than merely unreadable. */
function isGone(error: unknown): boolean {
  const code = systemErrorCode(error);
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * Walks a folder for a partial scan, or finds nothing if the folder is gone, so its items are
 * marked missing. Returns undefined if the folder is there but can't be read.
 */
async function walkScope(rootPath: string, scope: ScanScope): Promise<FoundEntry[] | undefined> {
  const found: FoundEntry[] = [];
  try {
    for await (const entry of walkRoot(rootPath, {
      startDir: scope.relDir,
      isShallow: scope.isShallow,
    })) {
      found.push(entry);
    }
  } catch (error) {
    if (!isGone(error)) {
      return undefined;
    }
    return [];
  }
  return found;
}

/**
 * Scans one folder, or one folder and everything under it, after the watcher saw a change
 * there. The root is checked first: if it has gone, it is marked offline and nothing is marked
 * missing, as for a full scan.
 */
export async function scanFolder(options: ScanOptions, scope: ScanScope): Promise<ScanSummary> {
  const run = startRun(options);
  if (!(await isReferenceFolderPresent(run.rootPath))) {
    setRootStatus(run.db, run.rootId, 'offline');
    return untouched(true);
  }
  const found = await walkScope(run.rootPath, scope);
  if (found === undefined) {
    return untouched(false);
  }
  const stored = findScanStatesUnder(run.db, run.rootId, scope).filter((state) =>
    isInScope(state, scope),
  );
  return { isOffline: false, ...(await reconcileEntries(run, found, stored)) };
}
