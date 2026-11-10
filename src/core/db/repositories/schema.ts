// The schema version and backups, for migrations.ts, and the checks a restored backup passes.
import type { Db } from '../connection.js';

/** The highest migration applied, kept in SQLite's user_version header field. */
export function readSchemaVersion(db: Db): number {
  return db.pragma('user_version', { simple: true }) as number;
}

/** Records a migration as applied. Runs inside the migration's transaction, so both roll back. */
export function writeSchemaVersion(db: Db, version: number): void {
  if (!Number.isInteger(version) || version < 0) {
    throw new Error(`Schema version ${String(version)} is not a whole number.`);
  }
  // PRAGMA takes no bound parameters; the check above keeps this a plain integer.
  db.pragma(`user_version = ${String(version)}`);
}

/** Writes a consistent copy of the whole database, including what's still in the WAL file. */
export function backUpDatabase(db: Db, targetFile: string): void {
  db.prepare('VACUUM INTO ?').run(targetFile);
}

/** Says whether SQLite finds every page, index and free-list entry of the file sound. */
export function isDatabaseSound(db: Db): boolean {
  const rows = db.pragma('quick_check') as { quick_check: string }[];
  return rows.length === 1 && rows[0]?.quick_check === 'ok';
}

/** Says whether the database holds a table of this name. */
export function hasTable(db: Db, name: string): boolean {
  const row = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  return row !== undefined;
}
