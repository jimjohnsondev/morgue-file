// R26: Settings' one-click backup saves the library as a zip, and restoring that zip on a fresh
// install brings back tags, collections, subcategories, notes and model profiles. A zip that
// isn't a backup, or whose library can't be opened, leaves the library as it was.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buffer } from 'node:stream/consumers';

import Database from 'better-sqlite3';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import yauzl from 'yauzl';

import { makeBackupZip } from '#core/backup/backup-zip.js';
import { BACKUPS_FOLDER_NAME } from '#core/db/library.js';
import { findItemByPath } from '#core/db/repositories/items.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { saveItemField } from '#core/fields/item-fields.js';
import { addSubcategory } from '#core/filing/subcategory-changes.js';
import { DEFAULT_SQUARE, thumbnailPath, THUMBS_FOLDER_NAME } from '#core/jobs/thumbnail-files.js';
import { linkItemToModel } from '#core/models/model-links.js';
import { saveModelProfile } from '#core/models/model-profiles.js';
import { createCollectionWith, tagSelection } from '#core/organize/bulk-changes.js';
import { buildApp } from '#server/app.js';
import { findAppDir, LOOPBACK_HOST } from '#server/config.js';
import { createLibraryRuntime } from '#server/library-runtime.js';

import type { Db } from '#core/db/connection.js';
import type { LibraryRuntime } from '#server/library-runtime.js';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

const PORT = 47613;
const HOST = `127.0.0.1:${String(PORT)}`;
const TOKEN = 'backup-test-token';
const STALE_THUMBNAIL = Buffer.from('a thumbnail made before the restore');
const PHOTOS = ['Figure/seated_backlit_017.jpg', 'Hands/hands_study_003.jpg'] as const;

/** A set-up install with its own data folder and Reference folder, served by the real runtime. */
type Install = {
  readonly dataDir: string;
  readonly referenceDir: string;
  readonly runtime: LibraryRuntime;
  readonly app: FastifyInstance;
  readonly db: () => Db;
  readonly get: (url: string) => Promise<LightMyRequestResponse>;
  readonly restore: (zip: Buffer) => Promise<LightMyRequestResponse>;
};

let workDir: string;
const installs: Install[] = [];

/** Writes the two small photos both installs' Reference folders hold. */
async function writeReferenceFolder(referenceDir: string): Promise<void> {
  for (const [index, relPath] of PHOTOS.entries()) {
    const file = path.join(referenceDir, relPath);
    await mkdir(path.dirname(file), { recursive: true });
    const gray = 80 + index * 60;
    const photo = sharp({
      create: { width: 16, height: 12, channels: 3, background: { r: gray, g: gray, b: gray } },
    });
    await writeFile(file, await photo.jpeg().toBuffer());
  }
}

/** Sets up an install on its own copy of the Reference folder and waits for its first index. */
async function startInstall(name: string): Promise<Install> {
  const dataDir = path.join(workDir, name, 'data');
  const referenceDir = path.join(workDir, name, 'Reference');
  await mkdir(dataDir, { recursive: true });
  await cp(path.join(workDir, 'Reference'), referenceDir, { recursive: true });
  const runtime = createLibraryRuntime({ appDir: findAppDir(), appVersion: '0.0.0-test' });
  const install = { kind: 'ready', dataDir, referenceDir } as const;
  const app = await buildApp({
    config: {
      host: LOOPBACK_HOST,
      port: PORT,
      appDir: findAppDir(),
      homeDir: findAppDir(),
      version: '0.0.0-test',
    },
    install: { current: install },
    token: TOKEN,
    library: runtime,
  });
  runtime.start(install, app.log);
  await runtime.whenIndexed();
  const started: Install = {
    dataDir,
    referenceDir,
    runtime,
    app,
    db: () => runtime.open()!.db,
    get: (url) => app.inject({ url, headers: { host: HOST } }),
    restore: (zip) =>
      app.inject({
        method: 'POST',
        url: '/api/backup/restore',
        headers: {
          host: HOST,
          origin: `http://${HOST}`,
          'sec-fetch-site': 'same-origin',
          'x-morgue-token': TOKEN,
          'content-type': 'application/zip',
        },
        payload: zip,
      }),
  };
  installs.push(started);
  return started;
}

/** The id of the item at a path in the Reference folder. */
function itemId(db: Db, relPath: string): number {
  return findItemByPath(db, REFERENCE_ROOT_ID, relPath)!.id;
}

/** Organizes the first install's library as the painter would, through the app's own core. */
function organize(db: Db): void {
  const backlit = itemId(db, PHOTOS[0]);
  const hands = itemId(db, PHOTOS[1]);
  tagSelection(db, { itemIds: [backlit] }, 'backlit');
  createCollectionWith(db, { itemIds: [backlit, hands] }, 'Spring model session');
  addSubcategory(db, { section: 'photos', name: 'Hands', folder: 'Hands' });
  saveItemField(db, { itemId: backlit, key: 'notes' }, 'Rim light from the north window.');
  linkItemToModel(db, { itemId: backlit, choice: { newName: 'Elena' } });
  const elena = db.prepare("SELECT id FROM models WHERE slug = 'elena'").get() as { id: number };
  saveModelProfile(db, elena.id, {
    values: new Map([
      ['name', 'Elena'],
      ['bio', 'Long poses, good with drapery.'],
    ]),
    tags: ['seated'],
  });
}

/** The names of a zip's entries. */
async function zipEntryNames(zip: Buffer): Promise<string[]> {
  const opened = await yauzl.fromBufferPromise(zip, { lazyEntries: true });
  const names: string[] = [];
  for await (const entry of opened.eachEntry()) {
    names.push(entry.fileName);
  }
  return names;
}

/** Makes a backup zip of a database file, as Back up now would have. */
async function zipOf(databaseFile: string): Promise<Buffer> {
  const db = new Database(databaseFile);
  try {
    const backup = makeBackupZip(db, {
      dataDir: workDir,
      appVersion: '0.0.0-test',
      now: new Date('2026-11-10T12:00:00Z'),
    });
    const bytes = await buffer(backup.content);
    await backup.discard();
    return bytes;
  } finally {
    db.close();
  }
}

let first: Install;
let backupZip: Buffer;

beforeAll(async () => {
  workDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-backup-'));
  await writeReferenceFolder(path.join(workDir, 'Reference'));
  first = await startInstall('first');
  organize(first.db());
  const download = await first.get('/settings/backup');
  expect(download.statusCode).toBe(200);
  backupZip = download.rawPayload;
}, 120_000);

afterAll(async () => {
  for (const install of installs) {
    await install.runtime.stop();
    await install.app.close();
  }
  await rm(workDir, { recursive: true, force: true });
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
    fresh = await startInstall('fresh');
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

describe('refusing what is not a backup', () => {
  let other: Install;

  beforeAll(async () => {
    other = await startInstall('other');
    tagSelection(other.db(), { itemIds: [itemId(other.db(), PHOTOS[0])] }, 'kept-as-it-was');
  }, 120_000);

  /** Says whether the library still holds what it held before the refused restore. */
  async function isUnchanged(): Promise<boolean> {
    return (await other.get('/tags/kept-as-it-was')).body.includes('seated_backlit_017');
  }

  it('R26: a file that is not a zip is refused, and the library is left as it was', async () => {
    const refused = await other.restore(Buffer.from('not a zip at all'));
    expect(refused.statusCode).toBe(400);
    expect(refused.json<{ message: string }>().message).toContain('not a Morgue File backup');
    expect(await isUnchanged()).toBe(true);
  });

  it('R26: a zip without a Morgue File library is refused', async () => {
    const plain = path.join(workDir, 'plain.db');
    const db = new Database(plain);
    db.exec('CREATE TABLE notes (text TEXT)');
    db.pragma('user_version = 1');
    db.close();
    const refused = await other.restore(await zipOf(plain));
    expect(refused.statusCode).toBe(400);
    expect(refused.json<{ message: string }>().message).toBe(
      'That zip holds no Morgue File library.',
    );
    expect(await isUnchanged()).toBe(true);
  });

  it('R26: a backup made by a newer Morgue File is refused with what to do', async () => {
    const newer = path.join(workDir, 'newer.db');
    first.db().prepare('VACUUM INTO ?').run(newer);
    const db = new Database(newer);
    db.pragma('user_version = 999');
    db.close();
    const refused = await other.restore(await zipOf(newer));
    expect(refused.statusCode).toBe(400);
    expect(refused.json<{ message: string }>().message).toContain('Update Morgue File');
    expect(await isUnchanged()).toBe(true);
  });

  it('R26: a backup whose library will not open puts the library back as it was', async () => {
    const broken = path.join(workDir, 'broken.db');
    const db = new Database(broken);
    for (const table of ['items', 'roots', 'fields', 'tags', 'collections', 'models']) {
      db.exec(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY)`);
    }
    db.pragma('user_version = 1');
    db.close();
    const refused = await other.restore(await zipOf(broken));
    expect(refused.statusCode).toBe(400);
    expect(refused.json<{ message: string }>().message).toContain('put back as it was');
    expect(await isUnchanged()).toBe(true);
  });
});
