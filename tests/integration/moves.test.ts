// R1, moves: a new path whose size and partial hash match an item that has just gone missing is
// that item, re-pointed, whether the move happened while the app ran or while it was closed.
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readPartialHash } from '#core/archive/originals.js';
import { setItemPartialHash, updateItemFile } from '#core/db/repositories/item-files.js';
import { fileItemsByHand, findItemByPath } from '#core/db/repositories/items.js';
import { findJob } from '#core/db/repositories/jobs.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { insertFolderMapping, insertSubcategory } from '#core/db/repositories/subcategories.js';
import { findTagNamesByItem, tagItems } from '#core/db/repositories/tags.js';
import { readMoveHash } from '#core/indexer/moves.js';
import { scanRoot } from '#core/indexer/scanner.js';
import { runThumbnailJob } from '#core/jobs/thumbnails.js';

import { makeTempLibrary } from '../support/temp-library.ts';

import type { Item } from '#core/db/repositories/items.js';
import type { TempLibrary } from '../support/temp-library.ts';

const START = new Date('2026-11-01T12:00:00.000Z');

let referenceDir: string;
let library: TempLibrary;

/** Writes a file under the Reference folder; its bytes depend on `content`. */
async function writeArchiveFile(relPath: string, content = relPath, size = 4096): Promise<void> {
  const file = path.join(referenceDir, relPath);
  await mkdir(path.dirname(file), { recursive: true });
  const bytes = Buffer.alloc(size);
  bytes.write(content);
  await writeFile(file, bytes);
}

/** Scans the Reference folder as if at `minutes` past the start. */
async function scanAt(minutes: number): Promise<Awaited<ReturnType<typeof scanRoot>>> {
  return scanRoot({
    db: library.db,
    rootId: REFERENCE_ROOT_ID,
    rootPath: referenceDir,
    now: () => new Date(START.getTime() + minutes * 60_000),
  });
}

/** The item at a path, or undefined. */
function itemAt(relPath: string): Item | undefined {
  return findItemByPath(library.db, REFERENCE_ROOT_ID, relPath);
}

/** Stores an item's partial hash, as its thumbnail job does in the app. */
async function hashItem(relPath: string): Promise<Item> {
  const item = itemAt(relPath)!;
  setItemPartialHash(library.db, item.id, await readMoveHash(referenceDir, item));
  return item;
}

/** Moves a file within the Reference folder. */
async function moveFile(from: string, to: string): Promise<void> {
  await mkdir(path.dirname(path.join(referenceDir, to)), { recursive: true });
  await rename(path.join(referenceDir, from), path.join(referenceDir, to));
}

beforeEach(async () => {
  referenceDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-moves-'));
  await writeArchiveFile('Figure/seated_001.jpg');
  library = await makeTempLibrary(referenceDir);
  await scanAt(0);
});

afterEach(async () => {
  await library.remove();
  await rm(referenceDir, { recursive: true, force: true });
});

describe('R1: moves', () => {
  it('R1: a file moved while the app was closed keeps its item and tags at the next scan', async () => {
    const before = await hashItem('Figure/seated_001.jpg');
    tagItems(library.db, [before.id], 'seated');
    await moveFile('Figure/seated_001.jpg', 'Hands/seated_001.jpg');
    const summary = await scanAt(1);
    expect(summary).toMatchObject({ added: 0, moved: 1, missing: 0 });
    expect(itemAt('Hands/seated_001.jpg')?.id).toBe(before.id);
    expect(findTagNamesByItem(library.db, before.id)).toEqual(['seated']);
  });

  it('adds a new item for a file of the same size but other content', async () => {
    await hashItem('Figure/seated_001.jpg');
    await rm(path.join(referenceDir, 'Figure', 'seated_001.jpg'));
    await writeArchiveFile('Hands/other.jpg', 'something else');
    const summary = await scanAt(1);
    expect(summary).toMatchObject({ added: 1, moved: 0, missing: 1 });
  });

  it('claims an item missing for under 10 minutes, but not one missing for longer', async () => {
    const before = await hashItem('Figure/seated_001.jpg');
    await moveFile('Figure/seated_001.jpg', 'Away/seated_001.jpg');
    await rm(path.join(referenceDir, 'Away'), { recursive: true });
    await scanAt(1);
    expect(itemAt('Figure/seated_001.jpg')?.missingSince).toBeDefined();

    await writeArchiveFile('Hands/seated_001.jpg', 'Figure/seated_001.jpg');
    expect(await scanAt(5)).toMatchObject({ moved: 1 });
    expect(itemAt('Hands/seated_001.jpg')?.id).toBe(before.id);

    await rm(path.join(referenceDir, 'Hands', 'seated_001.jpg'));
    await scanAt(6);
    await writeArchiveFile('Portrait/seated_001.jpg', 'Figure/seated_001.jpg');
    expect(await scanAt(20)).toMatchObject({ added: 1, moved: 0 });
    expect(itemAt('Portrait/seated_001.jpg')?.id).not.toBe(before.id);
    expect(itemAt('Hands/seated_001.jpg')?.missingSince).toBeDefined();
  });

  it('files a moved item by its new folder, unless it was filed by hand', async () => {
    const figure = insertSubcategory(library.db, 'photos', 'Figure');
    const hands = insertSubcategory(library.db, 'photos', 'Hands');
    for (const [relPrefix, subcategoryId] of [
      ['Figure', figure],
      ['Hands', hands],
    ] as const) {
      insertFolderMapping(library.db, { rootId: REFERENCE_ROOT_ID, relPrefix, subcategoryId });
    }
    await writeArchiveFile('Figure/seated_002.jpg');
    await scanAt(1);
    await hashItem('Figure/seated_001.jpg');
    const byHand = await hashItem('Figure/seated_002.jpg');
    fileItemsByHand(library.db, [byHand.id], figure);
    await moveFile('Figure/seated_001.jpg', 'Hands/seated_001.jpg');
    await moveFile('Figure/seated_002.jpg', 'Hands/seated_002.jpg');
    expect(await scanAt(2)).toMatchObject({ moved: 2 });
    expect(itemAt('Hands/seated_001.jpg')?.subcategoryId).toBe(hands);
    expect(itemAt('Hands/seated_002.jpg')?.subcategoryId).toBe(figure);
  });
});

describe('partial hashes', () => {
  it('hashes the size and the first, middle and last 64 KiB', async () => {
    await writeArchiveFile('Figure/large.jpg', 'large', 1_000_000);
    const hash = await readPartialHash(referenceDir, 'Figure/large.jpg');
    // A change between the three chunks leaves the hash as it was; one inside a chunk doesn't.
    const file = path.join(referenceDir, 'Figure', 'large.jpg');
    const bytes = Buffer.alloc(1_000_000);
    bytes.write('large');
    bytes[200_000] = 1;
    await writeFile(file, bytes);
    expect(await readPartialHash(referenceDir, 'Figure/large.jpg')).toBe(hash);
    bytes[500_000] = 1;
    await writeFile(file, bytes);
    expect(await readPartialHash(referenceDir, 'Figure/large.jpg')).not.toBe(hash);
  });

  it('is stored by the thumbnail job, even when the thumbnail cannot be made', async () => {
    const item = itemAt('Figure/seated_001.jpg')!;
    const job = findJob(library.db, item.id, 'thumb-image')!;
    const context = { db: library.db, thumbsDir: library.dataDir, mediaTools: undefined };
    // The file is zeros with a name in it, not a picture, so the thumbnail fails.
    await expect(runThumbnailJob(context, job)).rejects.toThrow();
    const row = library.db.prepare('SELECT partial_hash FROM items WHERE id = ?').get(item.id) as {
      partial_hash: string | null;
    };
    expect(row.partial_hash).toBe(await readPartialHash(referenceDir, item.relPath));
  });

  it('fails the job when the file changes while its thumbnail is made, so it is made again', async () => {
    const picture = await sharp({
      create: { width: 64, height: 48, channels: 3, background: '#808080' },
    })
      .jpeg()
      .toBuffer();
    await writeFile(path.join(referenceDir, 'Figure', 'seated_001.jpg'), picture);
    await scanAt(1);
    const item = itemAt('Figure/seated_001.jpg')!;
    const job = findJob(library.db, item.id, 'thumb-image')!;
    const context = { db: library.db, thumbsDir: library.dataDir, mediaTools: undefined };
    const running = runThumbnailJob(context, job);
    // A scan finds the file changed while the job is reading it.
    updateItemFile(library.db, { id: item.id, size: item.size + 1, mtimeMs: item.mtimeMs });
    await expect(running).rejects.toThrow('changed while its thumbnail was made');
    expect(itemAt('Figure/seated_001.jpg')?.thumbState).toBe('pending');
  });
});
