// R1: the Reference folder is watched once its startup scan is done. Added, moved and deleted
// files show up within 5 s; a moved file keeps its item and everything attached to it; an
// unplugged drive marks nothing missing and is scanned again when it comes back.
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setItemPartialHash } from '#core/db/repositories/item-files.js';
import { findItemByPath } from '#core/db/repositories/items.js';
import { findRootById, REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { findTagNamesByItem, tagItems } from '#core/db/repositories/tags.js';
import { readMoveHash } from '#core/indexer/moves.js';
import { startRootIndexing } from '#core/indexer/roots.js';

import { makeTempLibrary } from '../support/temp-library.ts';

import type { Item } from '#core/db/repositories/items.js';
import type { RootIndexing } from '#core/indexer/roots.js';
import type { TempLibrary } from '../support/temp-library.ts';

/** R1's limit for a change to show. */
const R1_LIMIT_MS = 5000;

const SILENT_LOG = { info: () => undefined, warn: () => undefined, error: () => undefined };

let referenceDir: string;
let library: TempLibrary;
let indexing: RootIndexing | undefined;

/** Writes a file of the given size under the Reference folder; its bytes depend on its name. */
async function writeArchiveFile(relPath: string, size = 2048): Promise<void> {
  const file = path.join(referenceDir, relPath);
  await mkdir(path.dirname(file), { recursive: true });
  const bytes = Buffer.alloc(size);
  bytes.write(relPath);
  await writeFile(file, bytes);
}

/** Polls until a check passes, and returns how long it took; fails after `limitMs`. */
async function waitFor(check: () => boolean, limitMs = R1_LIMIT_MS): Promise<number> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > limitMs) {
      throw new Error(`Still waiting after ${String(limitMs)} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return Date.now() - started;
}

/** The item at a path, or undefined. */
function itemAt(relPath: string): Item | undefined {
  return findItemByPath(library.db, REFERENCE_ROOT_ID, relPath);
}

/** Stores every item's partial hash, as each item's thumbnail job does in the app. */
async function hashEveryItem(): Promise<void> {
  const rows = library.db.prepare('SELECT id, rel_path, kind FROM items').all() as {
    id: number;
    rel_path: string;
    kind: Item['kind'];
  }[];
  for (const row of rows) {
    const hash = await readMoveHash(referenceDir, { relPath: row.rel_path, kind: row.kind });
    setItemPartialHash(library.db, row.id, hash);
  }
}

/** Starts indexing the Reference folder and waits for the scan to end and the watcher to start. */
async function startIndexing(options: { recheckMs?: number } = {}): Promise<RootIndexing> {
  indexing = startRootIndexing({
    db: library.db,
    rootId: REFERENCE_ROOT_ID,
    log: SILENT_LOG,
    wakeQueue: () => undefined,
    ...options,
  });
  await indexing.whenIdle();
  return indexing;
}

beforeEach(async () => {
  referenceDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-watch-'));
  await writeArchiveFile('Figure/seated_001.jpg');
  await writeArchiveFile('Figure/seated_002.jpg', 3000);
  await writeArchiveFile('Hands/hands_001.jpg', 4000);
  await writeArchiveFile('Books/A Sketchbook of Hands/001.jpg', 1000);
  await writeArchiveFile('Books/A Sketchbook of Hands/002.jpg', 1100);
  library = await makeTempLibrary(referenceDir);
});

afterEach(async () => {
  await indexing?.stop();
  indexing = undefined;
  await library.remove();
  await rm(`${referenceDir}-away`, { recursive: true, force: true });
  await rm(referenceDir, { recursive: true, force: true });
});

describe('R1: watched folders', () => {
  it('R1: a file added to a watched folder appears within 5 s', async () => {
    await startIndexing();
    await writeArchiveFile('Figure/seated_003.jpg', 5000);
    const elapsed = await waitFor(() => itemAt('Figure/seated_003.jpg') !== undefined);
    expect(elapsed).toBeLessThan(R1_LIMIT_MS);
    expect(itemAt('Figure/seated_003.jpg')).toMatchObject({ kind: 'image', size: 5000 });
  });

  it('R1: a file moved to another folder keeps its item, with its tags', async () => {
    await startIndexing();
    await hashEveryItem();
    const before = itemAt('Figure/seated_001.jpg')!;
    tagItems(library.db, [before.id], 'seated');
    await rename(
      path.join(referenceDir, 'Figure', 'seated_001.jpg'),
      path.join(referenceDir, 'Hands', 'seated_001.jpg'),
    );
    await waitFor(() => itemAt('Hands/seated_001.jpg') !== undefined);
    await indexing!.whenIdle();
    const after = itemAt('Hands/seated_001.jpg')!;
    expect(after.id).toBe(before.id);
    expect(after.missingSince).toBeUndefined();
    expect(findTagNamesByItem(library.db, after.id)).toEqual(['seated']);
    expect(itemAt('Figure/seated_001.jpg')).toBeUndefined();
  });

  it('R1: a renamed folder keeps its items, page folders included', async () => {
    await startIndexing();
    await hashEveryItem();
    const photo = itemAt('Figure/seated_002.jpg')!;
    const book = itemAt('Books/A Sketchbook of Hands')!;
    await rename(path.join(referenceDir, 'Figure'), path.join(referenceDir, 'Figures'));
    await rename(
      path.join(referenceDir, 'Books', 'A Sketchbook of Hands'),
      path.join(referenceDir, 'Books', 'Hands Sketchbook'),
    );
    await waitFor(
      () =>
        itemAt('Figures/seated_002.jpg') !== undefined &&
        itemAt('Books/Hands Sketchbook') !== undefined,
    );
    await indexing!.whenIdle();
    expect(itemAt('Figures/seated_002.jpg')?.id).toBe(photo.id);
    expect(itemAt('Books/Hands Sketchbook')).toMatchObject({ id: book.id, kind: 'pagefolder' });
  });

  it('R1: a file added during the startup scan, where the scan has already been, appears', async () => {
    indexing = startRootIndexing({
      db: library.db,
      rootId: REFERENCE_ROOT_ID,
      log: SILENT_LOG,
      wakeQueue: () => undefined,
    });
    indexing.pause();
    // Paused at its first item, the page folder in Books, so Books itself has been listed.
    await waitFor(() => indexing!.progress()?.found !== 0);
    await writeArchiveFile('Books/Notes on Gesture.pdf', 7000);
    await new Promise((resolve) => setTimeout(resolve, 300));
    indexing.resume();
    await indexing.whenIdle();
    const elapsed = await waitFor(() => itemAt('Books/Notes on Gesture.pdf') !== undefined);
    expect(elapsed).toBeLessThan(R1_LIMIT_MS);
  });

  it('R1: takes in files and folders whose names are not plain ASCII', async () => {
    await startIndexing();
    await writeArchiveFile('Études/drapé_ü_001.jpg', 5100);
    await waitFor(() => itemAt('Études/drapé_ü_001.jpg') !== undefined);
  });

  it('R1: a deleted file is marked missing, never deleted', async () => {
    await startIndexing();
    const item = itemAt('Hands/hands_001.jpg')!;
    await rm(path.join(referenceDir, 'Hands', 'hands_001.jpg'));
    await waitFor(() => itemAt('Hands/hands_001.jpg')?.missingSince !== undefined);
    expect(itemAt('Hands/hands_001.jpg')?.id).toBe(item.id);
  });

  it('R1: a deleted file that comes back is no longer missing', async () => {
    await startIndexing();
    const file = path.join(referenceDir, 'Hands', 'hands_001.jpg');
    await rename(file, path.join(referenceDir, 'hands_001.jpg.away'));
    await waitFor(() => itemAt('Hands/hands_001.jpg')?.missingSince !== undefined);
    await rename(path.join(referenceDir, 'hands_001.jpg.away'), file);
    await waitFor(() => itemAt('Hands/hands_001.jpg')?.missingSince === undefined);
  });
});

describe('R1: offline roots', () => {
  it('marks the root offline when its folder goes, without marking items missing', async () => {
    await startIndexing({ recheckMs: 200 });
    await rename(referenceDir, `${referenceDir}-away`);
    await waitFor(() => findRootById(library.db, REFERENCE_ROOT_ID)?.status === 'offline');
    const missing = library.db
      .prepare('SELECT COUNT(*) AS count FROM items WHERE missing_since IS NOT NULL')
      .get() as { count: number };
    expect(missing.count).toBe(0);
  });

  it('scans the folder again once it is back, and watches it', async () => {
    await startIndexing({ recheckMs: 200 });
    await rename(referenceDir, `${referenceDir}-away`);
    await waitFor(() => findRootById(library.db, REFERENCE_ROOT_ID)?.status === 'offline');
    await rename(`${referenceDir}-away`, referenceDir);
    await waitFor(() => findRootById(library.db, REFERENCE_ROOT_ID)?.status === 'online');
    await indexing!.whenIdle();
    await writeArchiveFile('Hands/hands_002.jpg', 6000);
    await waitFor(() => itemAt('Hands/hands_002.jpg') !== undefined);
  });

  it('looks for the folder at once when asked ("Check again", E3)', async () => {
    // A re-check far in the future, so only checkNow can find the folder in time.
    await startIndexing({ recheckMs: 600_000 });
    await rename(referenceDir, `${referenceDir}-away`);
    await waitFor(() => findRootById(library.db, REFERENCE_ROOT_ID)?.status === 'offline');
    await rename(`${referenceDir}-away`, referenceDir);
    await indexing!.checkNow();
    expect(findRootById(library.db, REFERENCE_ROOT_ID)?.status).toBe('online');
    await indexing!.whenIdle();
  });
});

describe('E5: pausing the index', () => {
  it('holds the scan while paused and finishes it once resumed', async () => {
    indexing = startRootIndexing({
      db: library.db,
      rootId: REFERENCE_ROOT_ID,
      log: SILENT_LOG,
      wakeQueue: () => undefined,
    });
    indexing.pause();
    await waitFor(() => indexing!.progress()?.found !== 0);
    expect(indexing.progress()).toMatchObject({ isPaused: true });
    const count = library.db.prepare('SELECT COUNT(*) AS count FROM items').get() as {
      count: number;
    };
    expect(count.count).toBe(0);
    indexing.resume();
    await indexing.whenIdle();
    expect(indexing.progress()).toBeUndefined();
    expect(itemAt('Hands/hands_001.jpg')).toBeDefined();
  });

  it('stops cleanly while paused', async () => {
    indexing = startRootIndexing({
      db: library.db,
      rootId: REFERENCE_ROOT_ID,
      log: SILENT_LOG,
      wakeQueue: () => undefined,
    });
    indexing.pause();
    await indexing.stop();
    indexing = undefined;
  });
});
