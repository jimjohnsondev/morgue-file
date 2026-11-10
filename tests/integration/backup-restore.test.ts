// R26: Settings' one-click backup saves the library as a zip, and restoring that zip on a fresh
// install brings back tags, collections, subcategories, notes and model profiles. A backup from
// an older release is migrated as it is restored.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import yauzl from 'yauzl';

import { openDatabase } from '#core/db/connection.js';
import { BACKUPS_FOLDER_NAME } from '#core/db/library.js';
import { migrate, readMigrations } from '#core/db/migrations.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { DEFAULT_SQUARE, thumbnailPath, THUMBS_FOLDER_NAME } from '#core/jobs/thumbnail-files.js';

import {
  itemId,
  makeBackupWorkspace,
  organize,
  PHOTOS,
  zipOf,
} from '../support/backup-installs.js';

import type { BackupWorkspace, Install } from '../support/backup-installs.js';

const STALE_THUMBNAIL = Buffer.from('a thumbnail made before the restore');

let workspace: BackupWorkspace;

/** The names of a zip's entries. */
async function zipEntryNames(zip: Buffer): Promise<string[]> {
  const opened = await yauzl.fromBufferPromise(zip, { lazyEntries: true });
  const names: string[] = [];
  for await (const entry of opened.eachEntry()) {
    names.push(entry.fileName);
  }
  return names;
}

let first: Install;
let backupZip: Buffer;

beforeAll(async () => {
  workspace = await makeBackupWorkspace();
  first = await workspace.startInstall('first');
  organize(first.db());
  const download = await first.get('/settings/backup');
  expect(download.statusCode).toBe(200);
  backupZip = download.rawPayload;
}, 120_000);

afterAll(async () => {
  await workspace.remove();
});

describe('backing up', () => {
  it('R26: Settings offers one-click backup and a restore form, with no dialog', async () => {
    const html = (await first.get('/settings')).body;
    expect(html).toContain('<a href="#backup">Backup and restore</a>');
    expect(html).toMatch(/<a href="\/settings\/backup" class="button button--primary" download/);
    expect(html).toContain('data-restore-form');
    expect(html).toContain('type="file"');
  });

  it('R26: one click downloads the library as a zip named by the time it was made', async () => {
    const download = await first.get('/settings/backup');
    expect(download.headers['content-type']).toBe('application/zip');
    expect(download.headers['content-disposition']).toMatch(
      /^attachment; filename="MorgueFile-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.zip"$/,
    );
    expect((await zipEntryNames(download.rawPayload)).sort()).toEqual([
      'library.db',
      'morgue-file-backup.json',
    ]);
    // The database copy the zip was read from is deleted once it has been sent.
    await expect
      .poll(() => readdirSync(first.dataDir).filter((name) => name.startsWith('backup-')))
      .toEqual([]);
  });
});

describe('restoring on a fresh install', () => {
  let fresh: Install;
  let oldThumbnail: string;

  beforeAll(async () => {
    fresh = await workspace.startInstall('fresh');
    const freshThumbs = path.join(fresh.dataDir, THUMBS_FOLDER_NAME);
    oldThumbnail = thumbnailPath(freshThumbs, itemId(fresh.db(), PHOTOS[1]), DEFAULT_SQUARE);
    // Marked, so the test can tell it from the one the restored library makes for that id.
    await writeFile(oldThumbnail, STALE_THUMBNAIL);
    const restored = await fresh.restore(backupZip);
    expect(restored.statusCode).toBe(204);
    await fresh.runtime.whenIndexed();
  }, 120_000);

  it('R26: restoring on a fresh install brings back tags, collections, subcategories, notes and model profiles', async () => {
    const tagged = (await fresh.get('/tags/backlit')).body;
    expect(tagged).toContain('seated_backlit_017');
    const collections = (await fresh.get('/collections')).body;
    expect(collections).toContain('Spring model session');
    const hands = (await fresh.get('/photos/hands')).body;
    expect(hands).toContain('hands_study_003');
    const backlit = itemId(fresh.db(), PHOTOS[0]);
    expect((await fresh.get(`/item/${String(backlit)}`)).body).toContain(
      'Rim light from the north window.',
    );
    const profile = (await fresh.get('/models/elena')).body;
    expect(profile).toContain('Long poses, good with drapery.');
    expect(profile).toContain('seated');
  });

  it('R26: the restored library points at this install’s Reference folder and finds its files', () => {
    const root = fresh
      .db()
      .prepare('SELECT path, status FROM roots WHERE id = ?')
      .get(REFERENCE_ROOT_ID) as { path: string; status: string };
    expect(root).toEqual({ path: fresh.referenceDir, status: 'online' });
    const missing = fresh
      .db()
      .prepare('SELECT count(*) AS n FROM items WHERE missing_since IS NOT NULL');
    expect(missing.get()).toEqual({ n: 0 });
  });

  it('R26: thumbnails made before the restore are never shown for the restored items', () => {
    expect(existsSync(oldThumbnail) && readFileSync(oldThumbnail).equals(STALE_THUMBNAIL)).toBe(
      false,
    );
  });

  it('R26: the library as it was before the restore is copied to the backups folder', () => {
    const backups = readdirSync(path.join(fresh.dataDir, BACKUPS_FOLDER_NAME));
    expect(backups.some((name) => /^library-0\.0\.0-test-.+\.db$/.test(name))).toBe(true);
    expect(readdirSync(fresh.dataDir).filter((name) => name.startsWith('restore-'))).toEqual([]);
  });
});

describe('restoring an older backup', () => {
  let older: Install;

  /** A library at schema 2, before full-text search, as a release before 1.11 left it. */
  function makeSchemaTwoLibrary(file: string): void {
    const db = openDatabase(file);
    const options = { backupsDir: workspace.workDir, appVersion: '1.10.0', now: new Date() };
    migrate(db, options, readMigrations().slice(0, 2));
    db.exec(`
      INSERT INTO roots (id, path, label, status) VALUES (1, 'C:\\Reference', 'Reference', 'online');
      INSERT INTO items (id, root_id, rel_path, kind, section, size, mtime, added_at)
      VALUES (1, 1, '${PHOTOS[0]}', 'image', 'photos', 1, 1, '2026-10-31');
      INSERT INTO tags (id, name) VALUES (1, 'contrapposto');
      INSERT INTO item_tags (item_id, tag_id) VALUES (1, 1);
    `);
    db.close();
  }

  beforeAll(async () => {
    older = await workspace.startInstall('older');
  }, 120_000);

  it('R26: a backup from an older release is migrated as it is restored, and keeps its data', async () => {
    const file = path.join(workspace.workDir, 'schema-two.db');
    makeSchemaTwoLibrary(file);
    expect((await older.restore(await zipOf(file, workspace.workDir))).statusCode).toBe(204);
    await older.runtime.whenIndexed();
    expect((await older.get('/tags/contrapposto')).body).toContain('seated_backlit_017');
    expect((await older.get('/search?q=contrapposto')).body).toContain('seated_backlit_017');
  });
});
