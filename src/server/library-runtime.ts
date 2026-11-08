// Opens the library once the data folder is known, then keeps every watched folder indexed and
// makes thumbnails in the background (docs/ARCHITECTURE.md, Indexing and file watching). Pages are
// served while this runs; nothing here blocks a request.
import path from 'node:path';

import { openLibrary } from '#core/db/library.js';
import { findAllRoots, REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { purgeExpiredFields } from '#core/fields/fields.js';
import { startRootIndexing } from '#core/indexer/roots.js';
import { runHashJob } from '#core/jobs/hash-jobs.js';
import { DEFAULT_LANES, startJobQueue } from '#core/jobs/queue.js';
import { THUMBS_FOLDER_NAME } from '#core/jobs/thumbnail-files.js';
import { markThumbnailFailed, runThumbnailJob } from '#core/jobs/thumbnails.js';
import { findMediaTools } from '#core/jobs/workers/media-tools.js';

import type { Db } from '#core/db/connection.js';
import type { IndexingProgress, RootIndexing, RootIndexingOptions } from '#core/indexer/roots.js';
import type { JobQueue } from '#core/jobs/queue.js';
import type { ThumbnailContext } from '#core/jobs/thumbnails.js';
import type { InstallState } from './install/install-state.js';
import type { FastifyBaseLogger } from 'fastify';

export type { IndexingProgress } from '#core/indexer/roots.js';

/** A set-up install: the data folder and the Reference folder, if one was chosen. */
export type ReadyInstall = Extract<InstallState, { kind: 'ready' }>;

/** What a page can ask of indexing: pause or resume the scan, or look for an offline folder. */
export type IndexingAction = 'pause' | 'resume' | 'check';

/** An open library, as page and media routes use it. */
export type OpenLibrary = {
  readonly db: Db;
  /** What making a thumbnail needs, for the sizes a page asks for that the queue doesn't make. */
  readonly thumbnails: ThumbnailContext;
  /** Tells the queue there is new work, such as a thumbnail the page being viewed is missing. */
  readonly wakeQueue: () => void;
};

/** The open library and its background work. */
export type LibraryRuntime = {
  /** The library once it is open, or undefined before setup or if it couldn't be opened. */
  readonly open: () => OpenLibrary | undefined;
  /** Opens the library and starts indexing. Later calls do nothing. */
  readonly start: (install: ReadyInstall, log: FastifyBaseLogger) => void;
  /** The running scan's progress, or undefined when no scan is running. */
  readonly indexing: () => IndexingProgress | undefined;
  /** Pauses or resumes the scans (E5), or checks for offline folders now (E3). */
  readonly controlIndexing: (action: IndexingAction) => Promise<void>;
  /** Starts keeping a root indexed that Settings just added (R1, R36). */
  readonly watchRoot: (rootId: number) => void;
  /** Scans a root again in full from where its folder is stored now, starting its indexing if need be. */
  readonly rescanRoot: (rootId: number) => void;
  /** Resolves once no scan is running, the watcher is ready and no thumbnail job is left. */
  readonly whenIndexed: () => Promise<void>;
  /** Stops indexing and the queue, and closes the database. */
  readonly stop: () => Promise<void>;
};

/** What the runtime needs from the app: where the app is (for bin\) and its version. */
export type LibraryRuntimeOptions = {
  readonly appDir: string;
  readonly appVersion: string;
  /** Tests shorten the offline re-check and the wait for a new file to settle. */
  readonly recheckMs?: number;
  readonly settleMs?: number;
};

/** A library that has been started. */
type StartedLibrary = {
  readonly db: Db;
  readonly thumbnails: ThumbnailContext;
  readonly queue: JobQueue;
  /** Each watched folder being kept indexed, by root id. */
  readonly roots: Map<number, RootIndexing>;
  /** What indexing a root needs besides its id, for the roots Settings adds later. */
  readonly indexingOptions: Omit<RootIndexingOptions, 'rootId'>;
};

/** Starts the job queue: thumbnails, and the hash jobs of items an earlier release indexed. */
function startQueue(context: ThumbnailContext, log: FastifyBaseLogger): JobQueue {
  const { db } = context;
  return startJobQueue({
    db,
    lanes: DEFAULT_LANES,
    runJob: async (job) =>
      job.type === 'hash' ? runHashJob(db, job) : runThumbnailJob(context, job),
    onGiveUp: (job, error) => {
      if (job.type !== 'hash') {
        markThumbnailFailed(db, job);
      }
      log.warn({ err: error, itemId: job.itemId, type: job.type }, 'Gave up on a job');
    },
    onQueueError: (job, error) => {
      log.error({ err: error, jobId: job.id }, 'Could not record a job’s outcome');
    },
  });
}

/** Opens the library and starts its queue and the indexing of every watched folder. */
function startLibrary(
  options: LibraryRuntimeOptions,
  install: ReadyInstall,
  log: FastifyBaseLogger,
): StartedLibrary {
  const db = openLibrary({
    dataDir: install.dataDir,
    appVersion: options.appVersion,
    ...(install.referenceDir === undefined ? {} : { referenceDir: install.referenceDir }),
  });
  purgeExpiredFields(db, new Date());
  const mediaTools = findMediaTools(options.appDir);
  if (mediaTools === undefined) {
    log.warn('ffmpeg and ffprobe were not found; video thumbnails will fail.');
  }
  const context = { db, thumbsDir: path.join(install.dataDir, THUMBS_FOLDER_NAME), mediaTools };
  const queue = startQueue(context, log);
  const indexingOptions = {
    db,
    log,
    wakeQueue: queue.wake,
    ...(options.recheckMs === undefined ? {} : { recheckMs: options.recheckMs }),
    ...(options.settleMs === undefined ? {} : { settleMs: options.settleMs }),
  };
  const roots = new Map<number, RootIndexing>();
  for (const root of findAllRoots(db)) {
    // Root 1 is indexed only while setup's Reference folder is known.
    if (root.id !== REFERENCE_ROOT_ID || install.referenceDir !== undefined) {
      roots.set(root.id, startRootIndexing({ ...indexingOptions, rootId: root.id }));
    }
  }
  return { db, thumbnails: context, queue, roots, indexingOptions };
}

/** Runs a page's request to pause, resume or check on indexing, for every watched folder. */
async function runIndexingAction(library: StartedLibrary, action: IndexingAction): Promise<void> {
  const roots = [...library.roots.values()];
  if (action === 'check') {
    await Promise.all(roots.map(async (indexing) => indexing.checkNow()));
    return;
  }
  for (const indexing of roots) {
    if (action === 'pause') {
      indexing.pause();
    } else {
      indexing.resume();
    }
  }
}

/** The progress of the first scan running, so E5 shows one bar however many folders there are. */
function firstProgress(library: StartedLibrary): IndexingProgress | undefined {
  for (const indexing of library.roots.values()) {
    const progress = indexing.progress();
    if (progress !== undefined) {
      return progress;
    }
  }
  return undefined;
}

/** Starts indexing a root unless it is already kept indexed. */
function watchNewRoot(library: StartedLibrary, rootId: number): void {
  if (!library.roots.has(rootId)) {
    library.roots.set(rootId, startRootIndexing({ ...library.indexingOptions, rootId }));
  }
}

/** Scans a root again, or starts indexing it: root 1 of a setup that chose no Reference folder. */
function rescanOrWatch(library: StartedLibrary, rootId: number): void {
  const indexing = library.roots.get(rootId);
  if (indexing === undefined) {
    watchNewRoot(library, rootId);
  } else {
    indexing.rescan();
  }
}

/** Resolves once no root is being scanned and the queue has no thumbnail left to make. */
async function whenLibraryIndexed(library: StartedLibrary): Promise<void> {
  await Promise.all([...library.roots.values()].map(async (indexing) => indexing.whenIdle()));
  await library.queue.whenIdle();
}

/** The runtime's hold on its library: none until started, and none again once stopped. */
type LibraryHolder = { current: StartedLibrary | undefined };

/** The runtime's indexing controls, each doing nothing while no library is started. */
function indexingControls(
  holder: LibraryHolder,
): Pick<
  LibraryRuntime,
  'indexing' | 'controlIndexing' | 'watchRoot' | 'rescanRoot' | 'whenIndexed'
> {
  return {
    indexing: () => holder.current && firstProgress(holder.current),
    controlIndexing: async (action) => {
      if (holder.current !== undefined) {
        await runIndexingAction(holder.current, action);
      }
    },
    watchRoot: (rootId) => {
      if (holder.current !== undefined) {
        watchNewRoot(holder.current, rootId);
      }
    },
    rescanRoot: (rootId) => {
      if (holder.current !== undefined) {
        rescanOrWatch(holder.current, rootId);
      }
    },
    whenIndexed: async () => {
      if (holder.current !== undefined) {
        await whenLibraryIndexed(holder.current);
      }
    },
  };
}

/** Creates the runtime, not yet started: setup may still have to choose the data folder. */
export function createLibraryRuntime(options: LibraryRuntimeOptions): LibraryRuntime {
  const holder: LibraryHolder = { current: undefined };
  return {
    open: () => {
      const library = holder.current;
      return (
        library && { db: library.db, thumbnails: library.thumbnails, wakeQueue: library.queue.wake }
      );
    },
    start: (install, log) => {
      if (holder.current !== undefined) {
        return;
      }
      // A library that won't open (a failed migration, a corrupt file) is logged rather than
      // thrown, so the server keeps answering and setup's Save still succeeds.
      try {
        holder.current = startLibrary(options, install, log);
      } catch (error) {
        log.error({ err: error }, 'Could not open the library');
      }
    },
    ...indexingControls(holder),
    stop: async () => {
      const stopping = holder.current;
      if (stopping === undefined) {
        return;
      }
      holder.current = undefined;
      await Promise.all([...stopping.roots.values()].map(async (indexing) => indexing.stop()));
      await stopping.queue.stop();
      stopping.db.close();
    },
  };
}
