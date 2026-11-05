// Watches a root once its startup scan is done and scans the folders a change touches, so a file
// added, moved or deleted shows within 5 s (R1; docs/ARCHITECTURE.md, Watch). Changes are
// gathered until things have been quiet for a second, so a file still being copied isn't read
// half-written, then scanned one folder at a time, removals first.
import { setTimeout as sleep } from 'node:timers/promises';

import { findEntryKind, watchOriginals } from '#core/archive/originals.js';

import { parentFolder, scanFolder } from './scanner.js';

import type { EntryKind } from '#core/archive/originals.js';
import type { Db } from '#core/db/connection.js';
import type { ScanSummary } from './scanner.js';

/** How long changes must stop before they are scanned. */
const DEFAULT_SETTLE_MS = 1000;

/** The longest a change waits while others keep coming, so a long copy still shows within 5 s. */
const MAX_WAIT_MS = 2000;

/** The root to watch and who hears what the watcher does. */
export type WatcherOptions = {
  readonly db: Db;
  readonly rootId: number;
  readonly rootPath: string;
  /** Told after each folder scan, so the queue can make thumbnails for what it found. */
  readonly onScanned: (summary: ScanSummary) => void;
  /** Told once if the root's folder has gone; the watcher has stopped by then. */
  readonly onOffline: () => void;
  /** Told once if the system stopped reporting changes; the watcher has stopped by then. */
  readonly onLost: (error: unknown) => void;
  /** Told when one folder scan fails; the watcher carries on with the next. */
  readonly onError: (error: unknown) => void;
  /** Tests shorten the wait for changes to settle. */
  readonly settleMs?: number;
};

/** A running watcher. */
export type RootWatcher = {
  /** Resolves once no change is waiting to settle or be scanned (tests wait on it). */
  readonly whenSettled: () => Promise<void>;
  readonly close: () => Promise<void>;
};

/** The watcher's state: changes still settling, and folders waiting to be scanned. */
type WatchState = {
  readonly options: WatcherOptions;
  /** Paths changed since the last batch; '' stands for the whole root. */
  readonly changed: Set<string>;
  batchStartedAt: number | undefined;
  settleTimer: ReturnType<typeof setTimeout> | undefined;
  /** Folders waiting, by path; true when only the folder's own files need a look. */
  readonly waiting: Map<string, boolean>;
  sorting: Promise<void> | undefined;
  scanning: Promise<void> | undefined;
  isClosed: boolean;
};

/** Scans one waiting folder. Returns false once the root has gone and the watcher must stop. */
async function scanNext(state: WatchState, relDir: string, isShallow: boolean): Promise<boolean> {
  const { options } = state;
  try {
    const summary = await scanFolder(options, { relDir, isShallow });
    if (summary.isOffline) {
      return false;
    }
    options.onScanned(summary);
  } catch (error) {
    options.onError(error);
  }
  return true;
}

/** Scans waiting folders, in the order they were added, until none are left. */
async function scanWaiting(state: WatchState): Promise<void> {
  for (const [relDir, isShallow] of state.waiting) {
    if (state.isClosed) {
      break;
    }
    state.waiting.delete(relDir);
    if (!(await scanNext(state, relDir, isShallow))) {
      state.isClosed = true;
      state.options.onOffline();
    }
  }
  state.scanning = undefined;
}

/** Adds a folder to the waiting list, keeping the deeper of two requests for the same folder. */
function enqueueFolder(state: WatchState, relDir: string, isShallow: boolean): void {
  state.waiting.set(relDir, isShallow && (state.waiting.get(relDir) ?? true));
}

/**
 * Turns a changed path into folder scans. Its folder is scanned for its own files (and as a page
 * folder). A folder, or a path with nothing there now, is also scanned with everything under it,
 * which finds a new folder's files or marks a removed folder's items missing.
 */
function enqueueChange(state: WatchState, relPath: string, kind: EntryKind): void {
  if (kind !== 'file') {
    enqueueFolder(state, relPath, false);
  }
  if (relPath !== '') {
    enqueueFolder(state, parentFolder(relPath), true);
  }
}

/**
 * Sorts a settled batch of changes into folder scans and starts scanning. Removals go first, so
 * when a file or folder is moved, its old place is marked missing before its new place is
 * scanned, and the new place recognizes it as moved rather than new.
 */
async function sortBatch(state: WatchState, paths: readonly string[]): Promise<void> {
  const kinds = await Promise.all(
    paths.map(async (relPath) => findEntryKind(state.options.rootPath, relPath)),
  );
  const changes = paths.map((relPath, index) => ({ relPath, kind: kinds[index] ?? 'none' }));
  const removals = changes.filter((change) => change.kind === 'none');
  const others = changes.filter((change) => change.kind !== 'none');
  for (const change of [...removals, ...others]) {
    enqueueChange(state, change.relPath, change.kind);
  }
  state.sorting = undefined;
  if (!state.isClosed) {
    state.scanning ??= scanWaiting(state);
  }
}

/** Takes the changes gathered so far as one batch. */
function endBatch(state: WatchState): void {
  const paths = [...state.changed];
  state.changed.clear();
  state.batchStartedAt = undefined;
  state.settleTimer = undefined;
  state.sorting = sortBatch(state, paths);
}

/** Records a changed path and restarts the wait for things to settle. */
function onChange(state: WatchState, relPath: string | undefined, settleMs: number): void {
  if (state.isClosed) {
    return;
  }
  state.changed.add(relPath ?? '');
  state.batchStartedAt ??= Date.now();
  clearTimeout(state.settleTimer);
  const waitedMs = Date.now() - state.batchStartedAt;
  state.settleTimer = setTimeout(
    () => {
      endBatch(state);
    },
    Math.max(0, Math.min(settleMs, MAX_WAIT_MS - waitedMs)),
  );
}

/** Starts watching a root. */
export function startWatcher(options: WatcherOptions): RootWatcher {
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const state: WatchState = {
    ...{ options, changed: new Set(), batchStartedAt: undefined, settleTimer: undefined },
    ...{ waiting: new Map(), sorting: undefined, scanning: undefined, isClosed: false },
  };
  const watch = watchOriginals(options.rootPath, {
    onChange: (relPath) => {
      onChange(state, relPath, settleMs);
    },
    onError: (error) => {
      void close();
      options.onLost(error);
    },
  });
  async function close(): Promise<void> {
    state.isClosed = true;
    clearTimeout(state.settleTimer);
    watch.close();
    await state.sorting;
    await state.scanning;
  }
  function isBusy(): boolean {
    return (
      state.settleTimer !== undefined || state.sorting !== undefined || state.scanning !== undefined
    );
  }
  return {
    whenSettled: async () => {
      while (!state.isClosed && isBusy()) {
        await (state.sorting ?? state.scanning ?? sleep(20));
      }
    },
    close,
  };
}
