// Set-up installs on the real library runtime for the backup and restore tests (R26): each has
// its own data folder and its own copy of a two-photo Reference folder, and is served by the app.
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buffer } from 'node:stream/consumers';

import Database from 'better-sqlite3';
import sharp from 'sharp';

import { makeBackupZip } from '#core/backup/backup-zip.js';
import { LIBRARY_FILE_NAME } from '#core/db/connection.js';
import { findItemByPath } from '#core/db/repositories/items.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { saveItemField } from '#core/fields/item-fields.js';
import { addSubcategory } from '#core/filing/subcategory-changes.js';
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

/** The photos every install's Reference folder holds. */
export const PHOTOS = ['Figure/seated_backlit_017.jpg', 'Hands/hands_study_003.jpg'] as const;

/** A set-up install with its own data folder and Reference folder, served by the real runtime. */
export type Install = {
  readonly dataDir: string;
  readonly referenceDir: string;
  readonly runtime: LibraryRuntime;
  readonly db: () => Db;
  readonly get: (url: string) => Promise<LightMyRequestResponse>;
  readonly restore: (zip: Buffer) => Promise<LightMyRequestResponse>;
};

/** A temporary folder of installs, and how to start one, zip a database, and remove them all. */
export type BackupWorkspace = {
  readonly workDir: string;
  /** Starts an install; with `unopenable`, its library.db holds those bytes and won't open. */
  readonly startInstall: (name: string, unopenable?: Buffer) => Promise<Install>;
  readonly remove: () => Promise<void>;
};

/** Writes the two small, invented photos. */
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

/** Sends a restore as Settings' form does: same origin, with the token, the zip as the body. */
function sendRestore(app: FastifyInstance, zip: Buffer): Promise<LightMyRequestResponse> {
  return app.inject({
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
  });
}

/** Builds the app over a new runtime, starts the library and waits for its first index. */
async function serveInstall(dataDir: string, referenceDir: string) {
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
  return { runtime, app };
}

/** Makes a workspace with the Reference folder every install copies. */
export async function makeBackupWorkspace(): Promise<BackupWorkspace> {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-backup-'));
  await writeReferenceFolder(path.join(workDir, 'Reference'));
  const served: { runtime: LibraryRuntime; app: FastifyInstance }[] = [];
  return {
    workDir,
    startInstall: async (name, unopenable) => {
      const dataDir = path.join(workDir, name, 'data');
      const referenceDir = path.join(workDir, name, 'Reference');
      await mkdir(dataDir, { recursive: true });
      if (unopenable !== undefined) {
        await writeFile(path.join(dataDir, LIBRARY_FILE_NAME), unopenable);
      }
      await cp(path.join(workDir, 'Reference'), referenceDir, { recursive: true });
      const { runtime, app } = await serveInstall(dataDir, referenceDir);
      served.push({ runtime, app });
      return {
        dataDir,
        referenceDir,
        runtime,
        db: () => runtime.open()!.db,
        get: (url) => app.inject({ url, headers: { host: HOST } }),
        restore: (zip) => sendRestore(app, zip),
      };
    },
    remove: async () => {
      for (const { runtime, app } of served) {
        await runtime.stop();
        await app.close();
      }
      await rm(workDir, { recursive: true, force: true });
    },
  };
}

/** The id of the item at a path in the Reference folder. */
export function itemId(db: Db, relPath: string): number {
  return findItemByPath(db, REFERENCE_ROOT_ID, relPath)!.id;
}

/** Organizes a library as the painter would, through the app's own core. */
export function organize(db: Db): void {
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

/** Makes a backup zip of a database file, as Back up now would have. */
export async function zipOf(databaseFile: string, workDir: string): Promise<Buffer> {
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

/**
 * Writes a database that passes a restore's checks (the first schema's tables, version 1) but
 * fails to migrate, so the library won't open from it.
 */
export function writeUnmigratableLibrary(file: string): void {
  const db = new Database(file);
  for (const table of ['items', 'roots', 'fields', 'tags', 'collections', 'models']) {
    db.exec(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY)`);
  }
  db.pragma('user_version = 1');
  db.close();
}
