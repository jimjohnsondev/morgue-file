// R26: a restore refuses a zip that isn't a Morgue File backup, or whose library can't be
// opened, and leaves the library as it was; a library that failed to open at launch is kept
// as it lay on disk before a backup replaces it.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LIBRARY_FILE_NAME } from '#core/db/connection.js';
import { BACKUPS_FOLDER_NAME } from '#core/db/library.js';
import { tagSelection } from '#core/organize/bulk-changes.js';

import {
  itemId,
  makeBackupWorkspace,
  organize,
  PHOTOS,
  writeUnmigratableLibrary,
  zipOf,
} from '../support/backup-installs.js';

import type { BackupWorkspace, Install } from '../support/backup-installs.js';

let workspace: BackupWorkspace;
let first: Install;
let backupZip: Buffer;

beforeAll(async () => {
  workspace = await makeBackupWorkspace();
  first = await workspace.startInstall('first');
  organize(first.db());
  backupZip = (await first.get('/settings/backup')).rawPayload;
}, 120_000);

afterAll(async () => {
  await workspace.remove();
});

describe('refusing what is not a backup', () => {
  let other: Install;

  beforeAll(async () => {
    other = await workspace.startInstall('other');
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
    const plain = path.join(workspace.workDir, 'plain.db');
    const db = new Database(plain);
    db.exec('CREATE TABLE notes (text TEXT)');
    db.pragma('user_version = 1');
    db.close();
    const refused = await other.restore(await zipOf(plain, workspace.workDir));
    expect(refused.statusCode).toBe(400);
    expect(refused.json<{ message: string }>().message).toBe(
      'That zip holds no Morgue File library.',
    );
    expect(await isUnchanged()).toBe(true);
  });

  it('R26: a backup made by a newer Morgue File is refused with what to do', async () => {
    const newer = path.join(workspace.workDir, 'newer.db');
    first.db().prepare('VACUUM INTO ?').run(newer);
    const db = new Database(newer);
    db.pragma('user_version = 999');
    db.close();
    const refused = await other.restore(await zipOf(newer, workspace.workDir));
    expect(refused.statusCode).toBe(400);
    expect(refused.json<{ message: string }>().message).toContain('Update Morgue File');
    expect(await isUnchanged()).toBe(true);
  });

  it('R26: a backup whose library will not open puts the library back as it was', async () => {
    const broken = path.join(workspace.workDir, 'broken.db');
    writeUnmigratableLibrary(broken);
    const refused = await other.restore(await zipOf(broken, workspace.workDir));
    expect(refused.statusCode).toBe(400);
    expect(refused.json<{ message: string }>().message).toContain('put back as it was');
    expect(await isUnchanged()).toBe(true);
  });
});

describe('restoring over a library that failed to open', () => {
  const UNOPENABLE = {
    library: Buffer.from('a library this release could not open'),
    log: Buffer.from('changes still in its write-ahead log'),
  };

  it('R26: the library that would not open is kept, with its log, and the backup restores', async () => {
    const stuck = await workspace.startInstall('stuck', UNOPENABLE);
    expect(stuck.runtime.open()).toBeUndefined();
    expect((await stuck.restore(backupZip)).statusCode).toBe(204);
    await stuck.runtime.whenIndexed();
    expect((await stuck.get('/tags/backlit')).body).toContain('seated_backlit_017');
    const backups = path.join(stuck.dataDir, BACKUPS_FOLDER_NAME);
    const kept = readdirSync(backups).find((name) =>
      readFileSync(path.join(backups, name)).equals(UNOPENABLE.library),
    );
    expect(kept).toMatch(/\.db$/);
    expect(readFileSync(path.join(backups, `${kept!}-wal`)).equals(UNOPENABLE.log)).toBe(true);
  });

  it('R26: when the backup will not open either, the library is put back as it lay on disk', async () => {
    const stuck = await workspace.startInstall('stuck-twice', UNOPENABLE);
    const broken = path.join(workspace.workDir, 'broken-twice.db');
    writeUnmigratableLibrary(broken);
    const refused = await stuck.restore(await zipOf(broken, workspace.workDir));
    expect(refused.statusCode).toBe(400);
    expect(refused.json<{ message: string }>().message).toContain('put back as it was');
    const libraryFile = path.join(stuck.dataDir, LIBRARY_FILE_NAME);
    expect(readFileSync(libraryFile).equals(UNOPENABLE.library)).toBe(true);
    expect(readFileSync(`${libraryFile}-wal`).equals(UNOPENABLE.log)).toBe(true);
  });
});
