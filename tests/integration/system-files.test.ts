import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { countFiles } from '#core/archive/originals.js';
import { migrate, readMigrations } from '#core/db/migrations.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { scanRoot } from '#core/indexer/scanner.js';

import { makeTempLibrary } from '../support/temp-library.ts';

import type { TempLibrary } from '../support/temp-library.ts';

let referenceDir: string;
let library: TempLibrary;

/** Writes a file with a few bytes; the scanner reads names and sizes, not pictures. */
async function writeAt(relPath: string): Promise<void> {
  const target = path.join(referenceDir, ...relPath.split('/'));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `bytes of ${relPath}`);
}

/** Every item's path and kind, in path order. */
function items(): { rel_path: string; kind: string }[] {
  return library.db.prepare('SELECT rel_path, kind FROM items ORDER BY rel_path').all() as {
    rel_path: string;
    kind: string;
  }[];
}

beforeAll(async () => {
  referenceDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-system-files-'));
  // A page folder copied from a Mac, with a "._" metadata file beside every page.
  for (const name of ['001.jpg', '002.jpg', '._001.jpg', '._002.jpg', '.DS_Store', 'Thumbs.db']) {
    await writeAt(`Magazines/Issue 1/${name}`);
  }
  await writeAt('Figure/seated.jpg');
  await writeAt('Figure/._seated.jpg');
  await writeAt('Figure/desktop.ini');
  await writeAt('__MACOSX/Figure/._seated.jpg');
  await writeAt('.Trashes/501/old.jpg');
  library = await makeTempLibrary(referenceDir);
});

afterAll(async () => {
  await library.remove();
  await rm(referenceDir, { recursive: true, force: true });
});

describe('operating-system clutter in the Reference folder', () => {
  it('is never indexed, and a page folder with "._" files beside its pages is still one', async () => {
    await scanRoot({
      db: library.db,
      rootId: REFERENCE_ROOT_ID,
      rootPath: referenceDir,
      now: () => new Date('2026-11-11T12:00:00.000Z'),
    });
    expect(items()).toEqual([
      { rel_path: 'Figure/seated.jpg', kind: 'image' },
      { rel_path: 'Magazines/Issue 1', kind: 'pagefolder' },
    ]);
  });

  it('is left out of the file count the progress bar uses (E5)', async () => {
    expect(await countFiles(referenceDir)).toBe(3);
  });
});

describe('migrating a library that already indexed clutter', () => {
  it('removes those items and their search rows, and keeps everything else', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-system-migrate-'));
    const other = await makeTempLibrary(referenceDir);
    const db = other.db;
    db.exec(`
      DELETE FROM items;
      INSERT INTO items (id, root_id, rel_path, kind, section, size, mtime, added_at) VALUES
        (11, 1, 'Figure/seated.jpg', 'image', 'photos', 1, 1, '2026-11-01'),
        (12, 1, 'Figure/._seated.jpg', 'image', 'photos', 1, 1, '2026-11-01'),
        (13, 1, '._cover.jpg', 'image', 'photos', 1, 1, '2026-11-01'),
        (14, 1, '__MACOSX/Figure/a.jpg', 'image', 'photos', 1, 1, '2026-11-01'),
        (15, 1, '.Trashes/501/old.jpg', 'image', 'photos', 1, 1, '2026-11-01'),
        (16, 1, 'Notes on v.2/page_1.jpg', 'image', 'photos', 1, 1, '2026-11-01');
      INSERT INTO item_search (rowid, name) VALUES (11, 'seated'), (12, 'seated'), (13, 'cover');
    `);
    const version = readMigrations().find((migration) => migration.fileName.includes('system'));
    expect(version).toBeDefined();
    // Re-applying only this migration, as if the library came from the release before it.
    db.pragma(`user_version = ${String(version!.version - 1)}`);
    migrate(db, {
      backupsDir: path.join(dataDir, 'backups'),
      appVersion: '1.25.0',
      now: new Date(),
    });

    expect(
      (db.prepare('SELECT id FROM items ORDER BY id').all() as { id: number }[]).map(
        (row) => row.id,
      ),
    ).toEqual([11, 16]);
    expect(
      (db.prepare('SELECT rowid FROM item_search ORDER BY rowid').all() as { rowid: number }[]).map(
        (row) => row.rowid,
      ),
    ).toEqual([11]);
    await other.remove();
    await rm(dataDir, { recursive: true, force: true });
  });
});
