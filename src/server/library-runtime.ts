// Opens the library once the data folder is known, then indexes the Reference folder and makes
// thumbnails in the background (docs/ARCHITECTURE.md, Indexing step 1). Pages are served while
// this runs; nothing here blocks a request.
import path from 'node:path';

import { openLibrary } from '#core/db/library.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { scanRoot } from '#core/indexer/scanner.js';
import { DEFAULT_LANES, startJobQueue } from '#core/jobs/queue.js';
import { THUMBS_FOLDER_NAME } from '#core/jobs/thumbnail-files.js';
import { markThumbnailFailed, runThumbnailJob } from '#core/jobs/thumbnails.js';
import { findMediaTools } from '#core/jobs/workers/media-tools.js';

import type { Db } from '#core/db/connection.js';
import type { JobQueue } from '#core/jobs/queue.js';
import type { ThumbnailContext } from '#core/jobs/thumbnails.js';
import type { InstallState } from './install/install-state.js';
import type { FastifyBaseLogger } from 'fastify';

/** A set-up install: the data folder and the Reference folder, if one was chosen. */
export type ReadyInstall = Extract<InstallState, { kind: 'ready' }>;

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
  /** Resolves once the scan has finished and no thumbnail job is left (tests wait on it). */
  readonly whenIndexed: () => Promise<void>;
  /** Stops the scan and the queue, and closes the database. */
  readonly stop: () => Promise<void>;
};

/** What the runtime needs from the app: where the app is (for bin\) and its version. */
export type LibraryRuntimeOptions = {
  readonly appDir: string;
  readonly appVersion: string;
};

/** A library that has been started. */
type StartedLibrary = {
  readonly db: Db;
  readonly thumbnails: ThumbnailContext;
  readonly queue: JobQueue;
  readonly scanning: Promise<void>;
  readonly abortScan: AbortController;
};

/** Scans the Reference folder once, then wakes the queue for the thumbnails it found. */
async function scanReferenceFolder(
  library: Omit<StartedLibrary, 'scanning'>,
  referenceDir: string,
  log: FastifyBaseLogger,
): Promise<void> {
  try {
    const summary = await scanRoot({
      db: library.db,
      rootId: REFERENCE_ROOT_ID,
      rootPath: referenceDir,
      signal: library.abortScan.signal,
      onBatchWritten: library.queue.wake,
    });
    log.info({ scan: summary }, 'Scan of the Reference folder finished');
  } catch (error) {
    if (!library.abortScan.signal.aborted) {
      log.error({ err: error }, 'Scan of the Reference folder failed');
    }
  }
  library.queue.wake();
}

/** Opens the library and starts its queue and first scan. */
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
  const started = { db, thumbnails: context, queue, abortScan: new AbortController() };
  const scanning =
    install.referenceDir === undefined
      ? Promise.resolve()
      : scanReferenceFolder(started, install.referenceDir, log);
  return { ...started, scanning };
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
    whenIndexed: async () => {
      await library?.scanning;
      await library?.queue.whenIdle();
    },
    stop: async () => {
      if (library === undefined) {
        return;
      }
      const stopping = library;
      library = undefined;
      stopping.abortScan.abort();
      await stopping.scanning;
      await stopping.queue.stop();
      stopping.db.close();
    },
  };
}
