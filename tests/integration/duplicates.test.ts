// R8 in the core: a file saved to the Inbox is compared with the items of the same kind and size,
// by partial hash and then full hash, and a copy of a file the archive has links to its item
// instead of being saved again.
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findItemByPath } from '#core/db/repositories/items.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { readFieldValues } from '#core/fields/fields.js';
import { scanRoot } from '#core/indexer/scanner.js';
import { inboxMonthFolder, ingestFile } from '#core/ingest/ingest.js';

import { makeTempLibrary } from '../support/temp-library.js';

import type { TempLibrary } from '../support/temp-library.js';

let referenceDir: string;
let library: TempLibrary;

/** A file of a few hundred KiB, so its partial hash reads three separate parts of it. */
const STUDY_BYTES = Buffer.alloc(400 * 1024, 7);

/** The study with one byte changed away from the parts a partial hash reads. */
function studyChangedInPlace(): Buffer {
  const changed = Buffer.from(STUDY_BYTES);
  changed[100 * 1024] = 8;
  return changed;
}

/** Puts a file in the Reference folder, as Explorer would, and indexes it. */
async function addToArchive(relPath: string, bytes: Buffer): Promise<number> {
  await mkdir(path.join(referenceDir, path.dirname(relPath)), { recursive: true });
  await writeFile(path.join(referenceDir, relPath), bytes);
  await scanRoot({ db: library.db, rootId: REFERENCE_ROOT_ID, rootPath: referenceDir });
  return findItemByPath(library.db, REFERENCE_ROOT_ID, relPath)!.id;
}

/** Drops a file onto a page, as the ingest route does, with the address it came from. */
async function drop(fileName: string, bytes: Buffer, sourceUrl?: string) {
  return ingestFile(
    { db: library.db, wakeQueue: () => undefined },
    { fileName, content: Readable.from([bytes]), sourceUrl },
  );
}

/** The source address stored on an item, if any. */
function sourceUrlOf(itemId: number): unknown {
  const fields = readFieldValues(library.db, { entity: 'item', entityId: itemId });
  return fields.find((entry) => entry.field.key === 'source_url')?.value;
}

/** What the Inbox's month folder holds now. */
async function inboxFiles(): Promise<string[]> {
  return readdir(path.join(referenceDir, 'Inbox', inboxMonthFolder(new Date())));
}

beforeEach(async () => {
  referenceDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-duplicates-'));
  library = await makeTempLibrary(referenceDir);
});

afterEach(async () => {
  await library.remove();
  await rm(referenceDir, { recursive: true, force: true });
});

describe('R8: duplicate detection', () => {
  it('R8: re-importing a file filed elsewhere links to its item and writes nothing', async () => {
    const itemId = await addToArchive('Figure/seated_study.jpg', STUDY_BYTES);
    expect(await drop('download.jpg', STUDY_BYTES)).toEqual({ itemId, isDuplicate: true });
    expect(await inboxFiles()).toEqual([]);
  });

  it('R8: a file that matches on size and partial hash but not in full is saved as new', async () => {
    const itemId = await addToArchive('Figure/seated_study.jpg', STUDY_BYTES);
    const saved = await drop('seated_study.jpg', studyChangedInPlace());
    expect(saved.isDuplicate).toBe(false);
    expect(saved.itemId).not.toBe(itemId);
    expect(await inboxFiles()).toEqual(['seated_study.jpg']);
  });

  it('R8: a file of another kind with the same bytes is saved as new', async () => {
    await addToArchive('Figure/seated_study.jpg', STUDY_BYTES);
    expect((await drop('seated_study.mp4', STUDY_BYTES)).isDuplicate).toBe(false);
  });

  it('R8: a copy of an item whose file has gone is saved as new', async () => {
    const itemId = await addToArchive('Figure/seated_study.jpg', STUDY_BYTES);
    await rm(path.join(referenceDir, 'Figure', 'seated_study.jpg'));
    const saved = await drop('seated_study.jpg', STUDY_BYTES);
    expect(saved).toEqual({ itemId: saved.itemId, isDuplicate: false });
    expect(saved.itemId).not.toBe(itemId);
  });

  it('R8: the same file dropped twice in a row is saved once', async () => {
    const first = await drop('hand.jpg', STUDY_BYTES);
    const second = await drop('hand copy.jpg', STUDY_BYTES);
    expect(second).toEqual({ itemId: first.itemId, isDuplicate: true });
    expect(await inboxFiles()).toEqual(['hand.jpg']);
  });

  it('R8: a copy fills in a source address the item lacks, and never replaces one', async () => {
    const itemId = await addToArchive('Figure/seated_study.jpg', STUDY_BYTES);
    await drop('a.jpg', STUDY_BYTES, 'https://example.com/first.jpg');
    await drop('b.jpg', STUDY_BYTES, 'https://example.com/second.jpg');
    expect(sourceUrlOf(itemId)).toBe('https://example.com/first.jpg');
  });
});
