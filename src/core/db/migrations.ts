// Brings library.db up to the current schema at startup, backing it up first (docs/ARCHITECTURE.md,
// Connections and migrations).
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { backUpDatabase, readSchemaVersion, writeSchemaVersion } from './repositories/schema.js';

import type { Db } from './connection.js';

/** One numbered SQL file from migrations/. */
export type Migration = {
  readonly version: number;
  readonly fileName: string;
  readonly sql: string;
};

/** What `migrate` needs besides the connection: where backups go, and what to call them. */
export type MigrateOptions = {
  readonly backupsDir: string;
  readonly appVersion: string;
  readonly now: Date;
};

/** How many backups of library.db are kept; older ones are deleted. */
export const KEPT_BACKUPS = 5;

const MIGRATION_FILE = /^(\d{3})_[a-z0-9_]+\.sql$/;
const BACKUP_FILE = /^library-.+-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.db$/;

/** The migrations folder: src/core/db/migrations in tests, dist/core/db/migrations when built. */
const MIGRATIONS_DIR = fileURLToPath(new URL('migrations', import.meta.url));

/**
 * Reads every migration in version order. Versions must run 1, 2, 3... with no gaps, so a
 * missing or misnamed file fails at startup instead of skipping part of the schema.
 */
export function readMigrations(folder = MIGRATIONS_DIR): Migration[] {
  const migrations = readdirSync(folder)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort()
    .map((fileName) => {
      const version = MIGRATION_FILE.exec(fileName)?.[1];
      if (version === undefined) {
        throw new Error(`Migration ${fileName} must be named like 001_initial.sql.`);
      }
      const sql = readFileSync(path.join(folder, fileName), 'utf8');
      return { version: Number(version), fileName, sql };
    });
  for (const [index, migration] of migrations.entries()) {
    if (migration.version !== index + 1) {
      throw new Error(`Migration ${migration.fileName} should be number ${String(index + 1)}.`);
    }
  }
  return migrations;
}

/**
 * Applies the migrations the database hasn't had yet, all in one transaction, so a failure
 * leaves the old schema untouched. A database that already holds a schema is backed up first.
 * Returns the versions it applied.
 */
export function migrate(
  db: Db,
  options: MigrateOptions,
  migrations: readonly Migration[] = readMigrations(),
): number[] {
  const current = readSchemaVersion(db);
  const pending = migrations.filter((migration) => migration.version > current);
  if (pending.length === 0) {
    return [];
  }
  if (current > 0) {
    backUpBeforeMigrating(db, options);
  }
  db.transaction(() => {
    for (const migration of pending) {
      db.exec(migration.sql);
      writeSchemaVersion(db, migration.version);
    }
  })();
  return pending.map((migration) => migration.version);
}

/** Copies the database into the backups folder, then deletes all but the newest few copies. */
function backUpBeforeMigrating(db: Db, options: MigrateOptions): void {
  mkdirSync(options.backupsDir, { recursive: true });
  const stamp = options.now.toISOString().replaceAll(':', '-').replace('.', '-');
  const fileName = `library-${options.appVersion}-${stamp}.db`;
  backUpDatabase(db, path.join(options.backupsDir, fileName));
  for (const oldBackup of backupsOldestFirst(options.backupsDir).slice(0, -KEPT_BACKUPS)) {
    rmSync(path.join(options.backupsDir, oldBackup));
  }
}

/**
 * The backups in the folder, oldest first by the time in their name rather than the app version
 * before it, which doesn't sort.
 */
function backupsOldestFirst(backupsDir: string): string[] {
  const backups = readdirSync(backupsDir).flatMap((fileName) => {
    const stamp = BACKUP_FILE.exec(fileName)?.[1];
    return stamp === undefined ? [] : [{ fileName, stamp }];
  });
  backups.sort((left, right) => left.stamp.localeCompare(right.stamp));
  return backups.map((backup) => backup.fileName);
}
