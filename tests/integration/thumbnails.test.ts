import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { findItemByPath } from '#core/db/repositories/items.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { scanRoot } from '#core/indexer/scanner.js';
import { DEFAULT_LANES, startJobQueue } from '#core/jobs/queue.js';
import {
  DEFAULT_COVER,
  DEFAULT_SQUARE,
  THUMBS_FOLDER_NAME,
  thumbnailPath,
} from '#core/jobs/thumbnail-files.js';
import { markThumbnailFailed, runThumbnailJob } from '#core/jobs/thumbnails.js';
import { findMediaTools } from '#core/jobs/workers/media-tools.js';

import { hashTree } from '../../scripts/fixtures/write.ts';
import { writeSampleArchive } from '../support/sample-archive.ts';
import { makeTempLibrary } from '../support/temp-library.ts';

import type { Item } from '#core/db/repositories/items.js';
import type { SampleArchive } from '../support/sample-archive.ts';
import type { TempLibrary } from '../support/temp-library.ts';

let archive: SampleArchive;
let library: TempLibrary;
let hashesBefore: Awaited<ReturnType<typeof hashTree>>;

/** The stored item for a sample file. */
function itemFor(relPath: string): Item {
  return findItemByPath(library.db, REFERENCE_ROOT_ID, relPath)!;
}

beforeAll(async () => {
  archive = await writeSampleArchive();
  hashesBefore = await hashTree(archive.referenceDir);
  library = await makeTempLibrary(archive.referenceDir);
  await scanRoot({ db: library.db, rootId: REFERENCE_ROOT_ID, rootPath: archive.referenceDir });
  const context = {
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
}, 180_000);

afterAll(async () => {
  await library.remove();
  await rm(archive.referenceDir, { recursive: true, force: true });
});

describe('thumbnails for every P0 format', () => {
  it('R6: each format gets a thumbnail of its default size', async () => {
    for (const file of archive.files) {
      const item = itemFor(file.relPath);
      expect(item.thumbState, file.relPath).toBe('ready');
      const size = item.section === 'library' ? DEFAULT_COVER : DEFAULT_SQUARE;
      const thumbnail = thumbnailPath(
        path.join(library.dataDir, THUMBS_FOLDER_NAME),
        item.id,
        size,
      );
      expect(existsSync(thumbnail), file.relPath).toBe(true);
      // From a buffer: given a path, libvips' cache keeps the file open, and Windows then can't delete it.
      const metadata = await sharp(await readFile(thumbnail)).metadata();
      expect([metadata.format, metadata.width, metadata.height], file.relPath).toEqual([
        'webp',
        size.width,
        size.height,
      ]);
    }
  });

  it('records each item’s size, length or page count as the thumbnail is made', () => {
    const [jpg, , , , mp4, , pdf, cbz, pageFolder] = archive.files;
    expect(itemFor(jpg!.relPath)).toMatchObject({ width: jpg!.width, height: jpg!.height });
    expect(itemFor(mp4!.relPath)).toMatchObject({
      width: mp4!.width,
      height: mp4!.height,
      fps: mp4!.fps,
      durationMs: mp4!.durationSeconds! * 1000,
    });
    for (const publication of [pdf!, cbz!, pageFolder!]) {
      expect(itemFor(publication.relPath).pageCount, publication.relPath).toBe(
        publication.pageCount,
      );
    }
  });

  it('R3: making thumbnails leaves every original byte for byte as it was', async () => {
    expect(await hashTree(archive.referenceDir)).toEqual(hashesBefore);
  });
});
