// R7: HEIC, TIFF, PSD and WebM files are indexed, get thumbnails and open in their viewers, as the
// P0 formats do (R6). The browser can't show HEIC, TIFF or PSD, so the image viewer opens a JPEG
// copy kept beside the thumbnails; WebM plays in the browser as it is.
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { findItemByPath } from '#core/db/repositories/items.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { scanRoot } from '#core/indexer/scanner.js';
import { DEFAULT_LANES, startJobQueue } from '#core/jobs/queue.js';
import { DEFAULT_SQUARE, THUMBS_FOLDER_NAME, thumbnailPath } from '#core/jobs/thumbnail-files.js';
import { markThumbnailFailed, runThumbnailJob } from '#core/jobs/thumbnails.js';
import { findMediaTools } from '#core/jobs/workers/media-tools.js';
import { buildApp } from '#server/app.js';
import { findAppDir, LOOPBACK_HOST } from '#server/config.js';

import { hashTree } from '../../scripts/fixtures/write.ts';
import { writeP1SampleArchive } from '../support/sample-archive.ts';
import { makeTempLibrary } from '../support/temp-library.ts';

import type { Item } from '#core/db/repositories/items.js';
import type { ThumbnailContext } from '#core/jobs/thumbnails.js';
import type { LibraryRuntime } from '#server/library-runtime.js';
import type { SampleArchive } from '../support/sample-archive.ts';
import type { TempLibrary } from '../support/temp-library.ts';
import type { FastifyInstance } from 'fastify';

const PORT = 47613;
const HOST = `127.0.0.1:${String(PORT)}`;

let archive: SampleArchive;
let library: TempLibrary;
let context: ThumbnailContext;
let app: FastifyInstance;
let hashesBefore: Awaited<ReturnType<typeof hashTree>>;

/** The sample file of one format, by its extension. */
function fileOf(extension: string): SampleArchive['files'][number] {
  return archive.files.find((file) => file.relPath.endsWith(extension))!;
}

/** The stored item for a sample file. */
function itemOf(extension: string): Item {
  return findItemByPath(library.db, REFERENCE_ROOT_ID, fileOf(extension).relPath)!;
}

/** A runtime over the test library whose queue has already run. */
function testRuntime(): LibraryRuntime {
  return {
    open: () => ({ db: library.db, thumbnails: context, wakeQueue: () => undefined }),
    start: () => undefined,
    indexing: () => undefined,
    controlIndexing: () => Promise.resolve(),
    watchRoot: () => undefined,
    rescanRoot: () => undefined,
    whenIndexed: () => Promise.resolve(),
    stop: () => Promise.resolve(),
  };
}

/** Fetches a page as this PC's browser would. */
async function get(url: string) {
  return app.inject({ url, headers: { host: HOST } });
}

beforeAll(async () => {
  archive = await writeP1SampleArchive();
  hashesBefore = await hashTree(archive.referenceDir);
  library = await makeTempLibrary(archive.referenceDir);
  await scanRoot({ db: library.db, rootId: REFERENCE_ROOT_ID, rootPath: archive.referenceDir });
  context = {
    db: library.db,
    thumbsDir: path.join(library.dataDir, THUMBS_FOLDER_NAME),
    mediaTools: findMediaTools(process.cwd()),
  };
  const queue = startJobQueue({
    db: library.db,
    lanes: DEFAULT_LANES,
    runJob: async (job) => runThumbnailJob(context, job),
    onGiveUp: (job) => {
      markThumbnailFailed(library.db, job);
    },
    onQueueError: () => undefined,
  });
  await queue.whenIdle();
  app = await buildApp({
    config: {
      host: LOOPBACK_HOST,
      port: PORT,
      appDir: findAppDir(),
      homeDir: findAppDir(),
      version: '0.0.0-test',
    },
    install: {
      current: { kind: 'ready', dataDir: library.dataDir, referenceDir: archive.referenceDir },
    },
    token: 'test-token',
    library: testRuntime(),
  });
}, 180_000);

afterAll(async () => {
  await app.close();
  await library.remove();
  await rm(archive.referenceDir, { recursive: true, force: true });
});

describe('R7: HEIC, TIFF, PSD and WebM', () => {
  it('R7: each format imports into its section and gets a thumbnail of the default size', async () => {
    for (const file of archive.files) {
      const item = findItemByPath(library.db, REFERENCE_ROOT_ID, file.relPath);
      expect(item?.section, file.relPath).toBe(file.kind === 'video' ? 'video' : 'photos');
      expect(item?.thumbState, file.relPath).toBe('ready');
      const thumbnail = thumbnailPath(context.thumbsDir, item!.id, DEFAULT_SQUARE);
      // From a buffer: given a path, libvips' cache keeps the file open, and Windows then can't delete it.
      const metadata = await sharp(await readFile(thumbnail)).metadata();
      expect([metadata.format, metadata.width, metadata.height], file.relPath).toEqual([
        'webp',
        DEFAULT_SQUARE.width,
        DEFAULT_SQUARE.height,
      ]);
    }
  });

  it('R7: records each photo’s full size, a HEIC grid’s tiles joined and cropped, and the WebM’s length', () => {
    for (const extension of ['.heic', '.tif', '.psd']) {
      const { width, height } = fileOf(extension);
      expect(itemOf(extension), extension).toMatchObject({ width, height });
    }
    const webm = fileOf('.webm');
    expect(itemOf('.webm')).toMatchObject({
      width: webm.width,
      height: webm.height,
      fps: webm.fps,
      durationMs: webm.durationSeconds! * 1000,
    });
  });

  it('R7: HEIC, TIFF and PSD photos open in the image viewer as a full-size JPEG copy', async () => {
    for (const extension of ['.heic', '.tif', '.psd']) {
      const item = itemOf(extension);
      const version = `${String(item.mtimeMs)}-${String(item.size)}`;
      const page = await get(`/item/${String(item.id)}`);
      expect(page.statusCode, extension).toBe(200);
      expect(page.body, extension).toContain(`src="/media/view/${String(item.id)}?v=${version}"`);
      const copy = await get(`/media/view/${String(item.id)}?v=${version}`);
      expect(copy.statusCode, extension).toBe(200);
      expect(copy.headers['content-type'], extension).toBe('image/jpeg');
      expect(copy.headers['cache-control'], extension).toContain('immutable');
      const metadata = await sharp(copy.rawPayload).metadata();
      expect([metadata.format, metadata.width, metadata.height], extension).toEqual([
        'jpeg',
        item.width,
        item.height,
      ]);
    }
  });

  it('R7: a WebM video plays from its original, served as WebM', async () => {
    const item = itemOf('.webm');
    const page = await get(`/item/${String(item.id)}`);
    expect(page.body).toContain(`src="/media/original/${String(item.id)}"`);
    const video = await get(`/media/original/${String(item.id)}`);
    expect(video.statusCode).toBe(200);
    expect(video.headers['content-type']).toBe('video/webm');
  });

  it('R7: the item page names each format', async () => {
    const names = { '.heic': 'HEIC', '.tif': 'TIFF', '.psd': 'PSD', '.webm': 'WebM' };
    for (const [extension, name] of Object.entries(names)) {
      const page = await get(`/item/${String(itemOf(extension).id)}`);
      expect(page.body, extension).toContain(`>${name}<`);
    }
  });

  it('R3: making thumbnails and viewer copies leaves every original byte for byte as it was', async () => {
    expect(await hashTree(archive.referenceDir)).toEqual(hashesBefore);
  });
});
