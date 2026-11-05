// Keeps one root indexed for as long as the server runs: a full scan, with the watcher started
// just before it so no change made during the scan is lost, then the watcher alone. A check every
// 30 s notices the folder going offline even when no change is reported, scans it again once it
// is back, and retries a scan that failed (docs/ARCHITECTURE.md, Offline roots).
import { isReferenceFolderPresent } from '#core/archive/originals.js';
import { findRootById, setRootStatus } from '#core/db/repositories/roots.js';
import { AppError } from '#core/errors.js';

import { countExpectedFiles, createPauseGate } from './scan-progress.js';
import { scanRoot } from './scanner.js';
import { startHeldWatcher } from './watcher.js';

import type { Db } from '#core/db/connection.js';
import type { IndexingLog, PauseGate, ScanCounts } from './scan-progress.js';
import type { HeldWatcher } from './watcher.js';

export type { IndexingLog } from './scan-progress.js';

/** How often the root's folder is checked on. */
const DEFAULT_RECHECK_MS = 30_000;

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
  /** Tests shorten the 30 s check and the wait for a new file to settle. */
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
  /** Runs the 30 s check now ("Check again", E3). */
  readonly checkNow: () => Promise<void>;
  /** Resolves once no scan is running and the watcher, if on, has nothing waiting. */
  readonly whenIdle: () => Promise<void>;
  readonly stop: () => Promise<void>;
};

/** Everything a root's indexing keeps track of. */
type IndexingState = {
  readonly options: RootIndexingOptions;
  readonly abort: AbortController;
  readonly gate: PauseGate;
  counts: ScanCounts | undefined;
  scanning: Promise<void> | undefined;
  watcher: HeldWatcher | undefined;
  /** True while the root's folder is known to be gone, until a check finds it back. */
  isOffline: boolean;
  /**
   * True when the last full scan didn't finish, or changes during it may have been missed (its
   * watcher was lost), so the next check scans again rather than only restarting the watcher.
   */
  needsScan: boolean;
  checking: ReturnType<typeof setInterval> | undefined;
};

/** The root's folder as stored now, so an edit in Settings takes effect at the next scan. */
function rootPathOf(state: IndexingState): string {
  const root = findRootById(state.options.db, state.options.rootId);
  if (root === undefined) {
    throw new AppError('not-found', `Root ${String(state.options.rootId)} no longer exists.`);
  }
  return root.path;
}

/** Closes the watcher, if one is on. */
async function stopWatching(state: IndexingState): Promise<void> {
  const { watcher } = state;
  state.watcher = undefined;
  await watcher?.close();
}

/** Starts a held watcher for the scan to come, or none if the folder can't be watched. */
function startWatchingFor(state: IndexingState, rootPath: string): HeldWatcher | undefined {
  const { options } = state;
  try {
    return startHeldWatcher({
      db: options.db,
      rootId: options.rootId,
      rootPath,
      ...(options.settleMs === undefined ? {} : { settleMs: options.settleMs }),
      onScanned: options.wakeQueue,
      onOffline: () => {
        void goOffline(state);
      },
      onLost: (error) => {
        options.log.warn({ err: error }, 'Lost track of the Reference folder; scanning it again');
        void rescan(state);
      },
      onError: (error) => {
        options.log.warn({ err: error }, 'Could not take in a change to the Reference folder');
      },
    });
  } catch (error) {
    // Gone since the check, or the system is out of watches: the scan says which, and the next
    // check tries again.
    options.log.warn({ err: error }, 'Could not watch the Reference folder');
    return undefined;
  }
}

/** Runs the full scan, with the progress the E5 bar shows. */
async function scanWithProgress(state: IndexingState, rootPath: string) {
  const { options } = state;
  const counts: ScanCounts = { found: 0, expected: undefined };
  state.counts = counts;
  const counting = new AbortController();
  const signal = AbortSignal.any([state.abort.signal, counting.signal]);
  void countExpectedFiles(counts, { rootPath, signal }, options.log);
  try {
    return await scanRoot({
      db: options.db,
      rootId: options.rootId,
      rootPath,
      signal: state.abort.signal,
      onBatchWritten: options.wakeQueue,
      onFilesFound: (fileCount) => {
        counts.found += fileCount;
      },
      waitWhilePaused: state.gate.wait,
    });
  } finally {
    counting.abort();
    state.counts = undefined;
    options.wakeQueue();
  }
}

/** Watches and scans the root once; afterwards the watcher carries on, unless it is offline. */
async function scanThenWatch(state: IndexingState): Promise<void> {
  const { options } = state;
  try {
    const rootPath = rootPathOf(state);
    const watcher = startWatchingFor(state, rootPath);
    const summary = await scanWithProgress(state, rootPath);
    options.log.info({ scan: summary }, 'Scan of the Reference folder finished');
    if (summary.isOffline || state.abort.signal.aborted) {
      state.isOffline = summary.isOffline;
      await watcher?.close();
      return;
    }
    // A watcher lost during the scan saw nothing after that point: scan again at the next check.
    state.needsScan = watcher?.isClosed() === true;
    state.watcher = watcher?.isClosed() === true ? undefined : watcher;
    state.watcher?.release();
  } catch (error) {
    state.needsScan = true;
    if (!state.abort.signal.aborted) {
      options.log.error({ err: error }, 'Scan of the Reference folder failed; retrying later');
    }
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

/** Stops the watcher and scans the whole root again, which starts a new watcher. */
async function rescan(state: IndexingState): Promise<void> {
  await stopWatching(state);
  startScan(state);
}

/** Marks the root offline and stops watching it; the 30 s check waits for it to come back. */
async function goOffline(state: IndexingState): Promise<void> {
  state.options.log.warn({}, 'The Reference folder went offline');
  state.isOffline = true;
  setRootStatus(state.options.db, state.options.rootId, 'offline');
  await stopWatching(state);
}

/**
 * The 30 s check: scans an offline root once its folder is back, notices a watched one that has
 * gone (a renamed or unplugged folder may report no change), and retries a scan that failed.
 */
async function checkOnRoot(state: IndexingState): Promise<void> {
  if (state.scanning !== undefined || state.abort.signal.aborted) {
    return;
  }
  const look = await lookForRootFolder(state);
  if (look === undefined) {
    return;
  }
  if (!look.isPresent) {
    if (!state.isOffline) {
      await goOffline(state);
    }
  } else if (state.isOffline || state.needsScan) {
    state.isOffline = false;
    setRootStatus(state.options.db, state.options.rootId, 'online');
    startScan(state);
  } else if (state.watcher === undefined) {
    restartWatcher(state, look.rootPath);
  }
}

/** Looks for the root's folder: where it is stored and whether it is there, or undefined if the look failed. */
async function lookForRootFolder(
  state: IndexingState,
): Promise<{ rootPath: string; isPresent: boolean } | undefined> {
  try {
    const rootPath = rootPathOf(state);
    return { rootPath, isPresent: await isReferenceFolderPresent(rootPath) };
  } catch (error) {
    state.options.log.warn({ err: error }, 'Could not look for the Reference folder');
    return undefined;
  }
}

/**
 * Starts the watcher again after it couldn't start, without a full scan: the last scan finished,
 * and a full scan every 30 s on a folder that can't be watched would keep the E5 bar up for good.
 */
function restartWatcher(state: IndexingState, rootPath: string): void {
  const watcher = startWatchingFor(state, rootPath);
  state.watcher = watcher;
  watcher?.release();
}

/** Creates the state of a root's indexing, with nothing running yet. */
function createIndexingState(options: RootIndexingOptions): IndexingState {
  return {
    options,
    abort: new AbortController(),
    gate: createPauseGate(),
    counts: undefined,
    scanning: undefined,
    watcher: undefined,
    isOffline: false,
    needsScan: false,
    checking: undefined,
  };
}

/** Starts keeping a root indexed, beginning with a full scan. */
export function startRootIndexing(options: RootIndexingOptions): RootIndexing {
  const state = createIndexingState(options);
  startScan(state);
  state.checking = setInterval(() => {
    void checkOnRoot(state);
  }, options.recheckMs ?? DEFAULT_RECHECK_MS);
  return {
    progress: () => state.counts && { ...state.counts, isPaused: state.gate.isPaused() },
    pause: state.gate.pause,
    resume: state.gate.resume,
    checkNow: async () => checkOnRoot(state),
    whenIdle: async () => {
      await state.scanning;
      await state.watcher?.whenSettled();
    },
    stop: async () => {
      state.abort.abort();
      clearInterval(state.checking);
      // A paused scan must reach its next abort check to end.
      state.gate.resume();
      await state.scanning;
      await stopWatching(state);
    },
  };
}
