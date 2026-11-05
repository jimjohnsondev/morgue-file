// Keeps one root indexed for as long as the server runs: a full scan, then the watcher; when the
// folder goes offline, a check every 30 s and a fresh scan once it is back (docs/ARCHITECTURE.md,
// Offline roots). Scans report their progress and can be paused (E5).
import { countFiles, isReferenceFolderPresent } from '#core/archive/originals.js';
import { findRootById, setRootStatus } from '#core/db/repositories/roots.js';
import { AppError } from '#core/errors.js';

import { scanRoot } from './scanner.js';
import { startWatcher } from './watcher.js';

import type { Db } from '#core/db/connection.js';
import type { RootWatcher } from './watcher.js';

/** How often an offline root's folder is looked for. */
const DEFAULT_RECHECK_MS = 30_000;

/** Where indexing writes what it did: Fastify's logger in the app. */
export type IndexingLog = {
  readonly info: (details: object, message: string) => void;
  readonly warn: (details: object, message: string) => void;
  readonly error: (details: object, message: string) => void;
};

/** How far a scan has got (E5): files listed so far, the total once counted, and if paused. */
export type IndexingProgress = {
  readonly found: number;
  readonly expected: number | undefined;
  readonly isPaused: boolean;
};

/** The root to keep indexed, and what to tell when there's work for the thumbnail queue. */
export type RootIndexingOptions = {
  readonly db: Db;
  readonly rootId: number;
  readonly log: IndexingLog;
  readonly wakeQueue: () => void;
  /** Tests shorten the offline re-check and the wait for a new file to settle. */
  readonly recheckMs?: number;
  readonly settleMs?: number;
};

/** A root being kept indexed. */
export type RootIndexing = {
  /** The running scan's progress, or undefined when no scan is running. */
  readonly progress: () => IndexingProgress | undefined;
  /** Holds the running scan, and any later one, between files until resumed. */
  readonly pause: () => void;
  readonly resume: () => void;
  /** Looks for the root's folder now rather than at the next 30 s check ("Check again", E3). */
  readonly checkNow: () => Promise<void>;
  /** Resolves once no scan is running and the watcher, if on, has nothing waiting. */
  readonly whenIdle: () => Promise<void>;
  readonly stop: () => Promise<void>;
};

/** Everything a root's indexing keeps track of. */
type IndexingState = {
  readonly options: RootIndexingOptions;
  readonly abort: AbortController;
  progress: { found: number; expected: number | undefined } | undefined;
  isPaused: boolean;
  resumeWaiters: (() => void)[];
  scanning: Promise<void> | undefined;
  watcher: RootWatcher | undefined;
  recheck: ReturnType<typeof setInterval> | undefined;
};

/** The root's folder as stored now, so an edit in Settings takes effect at the next scan. */
function rootPathOf(state: IndexingState): string {
  const root = findRootById(state.options.db, state.options.rootId);
  if (root === undefined) {
    throw new AppError('not-found', `Root ${String(state.options.rootId)} no longer exists.`);
  }
  return root.path;
}

/** Lets a paused scan carry on. */
function releasePaused(state: IndexingState): void {
  state.isPaused = false;
  for (const resolve of state.resumeWaiters.splice(0)) {
    resolve();
  }
}

/** Waits while indexing is paused. */
async function waitWhilePaused(state: IndexingState): Promise<void> {
  if (state.isPaused) {
    await new Promise<void>((resolve) => state.resumeWaiters.push(resolve));
  }
}

/** Counts the root's files alongside the scan, so the bar can say how many there are in all. */
async function countExpected(
  state: IndexingState,
  rootPath: string,
  signal: AbortSignal,
): Promise<void> {
  try {
    const expected = await countFiles(rootPath, signal);
    if (state.progress !== undefined) {
      state.progress.expected = expected;
    }
  } catch (error) {
    if (!signal.aborted) {
      state.options.log.warn({ err: error }, 'Could not count the Reference folder’s files');
    }
  }
}

/** Scans the root once with progress, then watches it, or waits for it if it is offline. */
async function scanThenWatch(state: IndexingState): Promise<void> {
  const { options } = state;
  state.progress = { found: 0, expected: undefined };
  // The count stops when the scan does, so a scan that finishes first isn't followed by a second
  // walk of the whole folder.
  const counting = new AbortController();
  try {
    const rootPath = rootPathOf(state);
    void countExpected(state, rootPath, AbortSignal.any([state.abort.signal, counting.signal]));
    const summary = await scanRoot({
      ...{ db: options.db, rootId: options.rootId, rootPath, signal: state.abort.signal },
      onBatchWritten: options.wakeQueue,
      onFilesFound: (fileCount) => {
        if (state.progress !== undefined) {
          state.progress.found += fileCount;
        }
      },
      waitWhilePaused: async () => waitWhilePaused(state),
    });
    options.log.info({ scan: summary }, 'Scan of the Reference folder finished');
    if (summary.isOffline) {
      startRecheck(state);
    } else {
      startWatching(state, rootPath);
    }
  } catch (error) {
    if (!state.abort.signal.aborted) {
      options.log.error({ err: error }, 'Scan of the Reference folder failed');
    }
  } finally {
    counting.abort();
    state.progress = undefined;
    options.wakeQueue();
  }
}

/** Starts a scan unless one is running or indexing has stopped. */
function startScan(state: IndexingState): void {
  if (state.scanning !== undefined || state.abort.signal.aborted) {
    return;
  }
  state.scanning = (async () => {
    await scanThenWatch(state);
    state.scanning = undefined;
  })();
}

/** Says whether an offline root's folder is back. A failed look counts as not yet. */
async function isRootBack(state: IndexingState): Promise<boolean> {
  try {
    return await isReferenceFolderPresent(rootPathOf(state));
  } catch (error) {
    state.options.log.warn({ err: error }, 'Could not look for the Reference folder');
    return false;
  }
}

/** Looks for an offline root's folder, and scans it again if it is back. */
async function lookForRoot(state: IndexingState): Promise<void> {
  if (state.recheck === undefined || !(await isRootBack(state))) {
    return;
  }
  clearInterval(state.recheck);
  state.recheck = undefined;
  setRootStatus(state.options.db, state.options.rootId, 'online');
  startScan(state);
}

/** Checks for the root's folder every 30 s while it is offline. */
function startRecheck(state: IndexingState): void {
  if (state.recheck !== undefined || state.abort.signal.aborted) {
    return;
  }
  state.recheck = setInterval(() => {
    void lookForRoot(state);
  }, state.options.recheckMs ?? DEFAULT_RECHECK_MS);
}

/** Stops the watcher and waits for the folder, once a folder scan has found the root gone. */
async function goOffline(state: IndexingState): Promise<void> {
  state.options.log.warn({}, 'The Reference folder went offline');
  const { watcher } = state;
  state.watcher = undefined;
  await watcher?.close();
  startRecheck(state);
}

/** Scans the whole root again after the system stopped reporting its changes. */
function recoverLostWatch(state: IndexingState, error: unknown): void {
  state.options.log.warn({ err: error }, 'Lost track of the Reference folder; scanning it again');
  state.watcher = undefined;
  startScan(state);
}

/** Watches the root for changes, from now until it goes offline or indexing stops. */
function startWatching(state: IndexingState, rootPath: string): void {
  const { options } = state;
  if (state.abort.signal.aborted) {
    return;
  }
  state.watcher = startWatcher({
    ...{ db: options.db, rootId: options.rootId, rootPath },
    ...(options.settleMs === undefined ? {} : { settleMs: options.settleMs }),
    onScanned: options.wakeQueue,
    onOffline: () => {
      void goOffline(state);
    },
    onLost: (error) => {
      recoverLostWatch(state, error);
    },
    onError: (error) => {
      options.log.warn({ err: error }, 'Could not take in a change to the Reference folder');
    },
  });
}

/** Starts keeping a root indexed, beginning with a full scan. */
export function startRootIndexing(options: RootIndexingOptions): RootIndexing {
  const state: IndexingState = {
    ...{ options, abort: new AbortController(), progress: undefined },
    ...{ isPaused: false, resumeWaiters: [], scanning: undefined },
    ...{ watcher: undefined, recheck: undefined },
  };
  startScan(state);
  return {
    progress: () => state.progress && { ...state.progress, isPaused: state.isPaused },
    pause: () => {
      state.isPaused = true;
    },
    resume: () => {
      releasePaused(state);
    },
    checkNow: async () => lookForRoot(state),
    whenIdle: async () => {
      await state.scanning;
      await state.watcher?.whenSettled();
    },
    stop: async () => {
      state.abort.abort();
      // A paused scan must reach its next abort check to end.
      releasePaused(state);
      clearInterval(state.recheck);
      state.recheck = undefined;
      await state.scanning;
      await state.watcher?.close();
    },
  };
}
