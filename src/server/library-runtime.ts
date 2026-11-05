// Opens the library once the data folder is known, then keeps the Reference folder indexed and
// makes thumbnails in the background (docs/ARCHITECTURE.md, Indexing and file watching). Pages are
// served while this runs; nothing here blocks a request.
import path from 'node:path';

import { openLibrary } from '#core/db/library.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { startRootIndexing } from '#core/indexer/roots.js';
import { DEFAULT_LANES, startJobQueue } from '#core/jobs/queue.js';
import { THUMBS_FOLDER_NAME } from '#core/jobs/thumbnail-files.js';
import { markThumbnailFailed, runThumbnailJob } from '#core/jobs/thumbnails.js';
import { findMediaTools } from '#core/jobs/workers/media-tools.js';

import type { Db } from '#core/db/connection.js';
import type { IndexingProgress, RootIndexing } from '#core/indexer/roots.js';
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
  /** Pauses or resumes the scan (E5), or checks for an offline Reference folder now (E3). */
  readonly controlIndexing: (action: IndexingAction) => Promise<void>;
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
  /** Undefined when setup chose no Reference folder. */
  readonly indexing: RootIndexing | undefined;
};

/** Opens the library and starts its queue and the Reference folder's indexing. */
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
  const mediaTools = findMediaTools(options.appDir);
  if (mediaTools === undefined) {
    log.warn('ffmpeg and ffprobe were not found; video thumbnails will fail.');
  }
  const context = { db, thumbsDir: path.join(install.dataDir, THUMBS_FOLDER_NAME), mediaTools };
  const queue = startJobQueue({
    db,
    lanes: DEFAULT_LANES,
    runJob: async (job) => runThumbnailJob(context, job),
    onGiveUp: (job, error) => {
      markThumbnailFailed(db, job);
      log.warn({ err: error, itemId: job.itemId }, 'Gave up making a thumbnail');
    },
    onQueueError: (job, error) => {
      log.error({ err: error, jobId: job.id }, 'Could not record a job’s outcome');
    },
  });
  const indexing =
    install.referenceDir === undefined
      ? undefined
      : startRootIndexing({
          ...{ db, rootId: REFERENCE_ROOT_ID, log, wakeQueue: queue.wake },
          ...(options.recheckMs === undefined ? {} : { recheckMs: options.recheckMs }),
          ...(options.settleMs === undefined ? {} : { settleMs: options.settleMs }),
        });
  return { db, thumbnails: context, queue, indexing };
}

/** Runs a page's request to pause, resume or check on indexing. */
async function runIndexingAction(indexing: RootIndexing, action: IndexingAction): Promise<void> {
  if (action === 'pause') {
    indexing.pause();
  } else if (action === 'resume') {
    indexing.resume();
  } else {
    await indexing.checkNow();
  }
}

/** Creates the runtime, not yet started: setup may still have to choose the data folder. */
export function createLibraryRuntime(options: LibraryRuntimeOptions): LibraryRuntime {
  let library: StartedLibrary | undefined;
  return {
    open: () =>
      library && { db: library.db, thumbnails: library.thumbnails, wakeQueue: library.queue.wake },
    start: (install, log) => {
      if (library !== undefined) {
        return;
      }
      // A library that won't open (a failed migration, a corrupt file) is logged rather than
      // thrown, so the server keeps answering and setup's Save still succeeds.
      try {
        library = startLibrary(options, install, log);
      } catch (error) {
        log.error({ err: error }, 'Could not open the library');
      }
    },
    indexing: () => library?.indexing?.progress(),
    controlIndexing: async (action) => {
      if (library?.indexing !== undefined) {
        await runIndexingAction(library.indexing, action);
      }
    },
    whenIndexed: async () => {
      await library?.indexing?.whenIdle();
      await library?.queue.whenIdle();
    },
    stop: async () => {
      if (library === undefined) {
        return;
      }
      const stopping = library;
      library = undefined;
      await stopping.indexing?.stop();
      await stopping.queue.stop();
      stopping.db.close();
    },
  };
}
