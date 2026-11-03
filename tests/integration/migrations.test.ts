import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LIBRARY_FILE_NAME, openDatabase } from '#core/db/connection.js';
import { BACKUPS_FOLDER_NAME, openLibrary } from '#core/db/library.js';
import { KEPT_BACKUPS, migrate, readMigrations } from '#core/db/migrations.js';
import { findRootById, REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { readSchemaVersion } from '#core/db/repositories/schema.js';

import type { Migration } from '#core/db/migrations.js';

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-migrate-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

function backupsDir(): string {
  return path.join(dataDir, BACKUPS_FOLDER_NAME);
}

/** The real migrations plus one more, as the next release would ship. */
function withNextMigration(sql: string): Migration[] {
  const migrations = readMigrations();
  const version = migrations.length + 1;
  return [...migrations, { version, fileName: `00${String(version)}_next.sql`, sql }];
}

/** Opens library.db in the temp data folder without migrating it. */
function openRaw(): ReturnType<typeof openDatabase> {
  return openDatabase(path.join(dataDir, LIBRARY_FILE_NAME));
}

describe('opening a library', () => {
  it('creates library.db at the latest schema, in WAL mode with foreign keys on', () => {
    const db = openLibrary({ dataDir, appVersion: '1.0.0', referenceDir: 'E:\\Reference' });
    expect(readSchemaVersion(db)).toBe(readMigrations().length);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
    db.close();
    expect(existsSync(backupsDir())).toBe(false);
  });

  it('points root 1 at the Reference folder, and follows it to a new drive letter', () => {
    const first = openLibrary({ dataDir, appVersion: '1.0.0', referenceDir: 'E:\\Reference' });
    expect(findRootById(first, REFERENCE_ROOT_ID)).toMatchObject({
      path: 'E:\\Reference',
      label: 'Reference',
      status: 'online',
    });
    first.close();
    const moved = openLibrary({ dataDir, appVersion: '1.0.0', referenceDir: 'F:\\Reference' });
    expect(findRootById(moved, REFERENCE_ROOT_ID)?.path).toBe('F:\\Reference');
    moved.close();
  });

  it('seeds the Books and Magazines subcategories and the built-in fields', () => {
    const db = openLibrary({ dataDir, appVersion: '1.0.0' });
    const subcategories = db.prepare('SELECT name FROM subcategories ORDER BY id').all();
    expect(subcategories).toEqual([{ name: 'Books' }, { name: 'Magazines' }]);
    const fields = db.prepare('SELECT entity, key FROM fields ORDER BY id').all();
    expect(fields).toEqual([
      { entity: 'item', key: 'notes' },
      { entity: 'item', key: 'source_url' },
      { entity: 'item', key: 'rating' },
      { entity: 'item', key: 'magazine_title' },
      { entity: 'item', key: 'issue_date' },
      { entity: 'model', key: 'name' },
      { entity: 'model', key: 'bio' },
    ]);
    db.close();
  });
});

describe('migrating an existing library', () => {
  it('applies nothing and makes no backup when the schema is current', () => {
    openLibrary({ dataDir, appVersion: '1.0.0' }).close();
    const db = openRaw();
    expect(migrate(db, { backupsDir: backupsDir(), appVersion: '1.0.1', now: new Date() })).toEqual(
      [],
    );
    db.close();
    expect(existsSync(backupsDir())).toBe(false);
  });

  it('backs up library.db, with its data, before applying a pending migration', () => {
    const db = openLibrary({ dataDir, appVersion: '1.0.0' });
    db.prepare("INSERT INTO settings (key, value) VALUES ('kept', '\"yes\"')").run();
    const next = withNextMigration('CREATE TABLE added_later (id INTEGER PRIMARY KEY);');
    const now = new Date('2026-11-03T09:30:00.123Z');
    expect(migrate(db, { backupsDir: backupsDir(), appVersion: '1.1.0', now }, next)).toEqual([
      next.length,
    ]);
    db.close();

    expect(readdirSync(backupsDir())).toEqual(['library-1.1.0-2026-11-03T09-30-00-123Z.db']);
    const backup = openDatabase(path.join(backupsDir(), readdirSync(backupsDir())[0]!));
    expect(readSchemaVersion(backup)).toBe(next.length - 1);
    expect(backup.prepare("SELECT value FROM settings WHERE key = 'kept'").get()).toEqual({
      value: '"yes"',
    });
    backup.close();
  });

  it('keeps only the newest five backups, by time rather than version', () => {
    mkdirSync(backupsDir());
    const old = ['library-9.0.0-2026-01-01T00-00-00-000Z.db'];
    for (let month = 2; month <= 6; month++) {
      old.push(`library-1.0.${String(month)}-2026-0${String(month)}-01T00-00-00-000Z.db`);
    }
    for (const fileName of old) {
      writeFileSync(path.join(backupsDir(), fileName), 'old backup');
    }
    const db = openLibrary({ dataDir, appVersion: '1.0.0' });
    const now = new Date('2026-11-03T00:00:00.000Z');
    migrate(db, { backupsDir: backupsDir(), appVersion: '1.1.0', now }, withNextMigration(''));
    db.close();

    const kept = readdirSync(backupsDir()).sort();
    expect(kept).toHaveLength(KEPT_BACKUPS);
    expect(kept).not.toContain(old[0]);
    expect(kept).not.toContain(old[1]);
    expect(kept).toContain('library-1.1.0-2026-11-03T00-00-00-000Z.db');
  });

  it('leaves the schema as it was when a migration fails part way', () => {
    const db = openLibrary({ dataDir, appVersion: '1.0.0' });
    const before = readSchemaVersion(db);
    const broken = withNextMigration('CREATE TABLE half_done (id INTEGER); SELECT * FROM nowhere;');
    expect(() =>
      migrate(db, { backupsDir: backupsDir(), appVersion: '1.1.0', now: new Date() }, broken),
    ).toThrow(/nowhere/);
    expect(readSchemaVersion(db)).toBe(before);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'half_done'").get()).toBe(
      undefined,
    );
    db.close();
  });
});

describe('the migrations folder', () => {
  it('numbers its files 1, 2, 3... with no gaps', () => {
    const migrations = readMigrations();
    expect(migrations.map((migration) => migration.version)).toEqual(
      migrations.map((_, index) => index + 1),
    );
    expect(migrations[0]?.fileName).toBe('001_initial.sql');
  });

  it('refuses a gap in the numbering', () => {
    const folder = path.join(dataDir, 'migrations');
    mkdirSync(folder);
    writeFileSync(path.join(folder, '001_first.sql'), '');
    writeFileSync(path.join(folder, '003_third.sql'), '');
    expect(() => readMigrations(folder)).toThrow(/003_third\.sql should be number 2/);
  });
});
