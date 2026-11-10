// Checks a database taken from a backup, and puts a database file in library.db's place (R26).
import { copyFile, rm } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';

import { AppError } from '#core/errors.js';

import { LIBRARY_FILE_NAME } from './connection.js';
import { latestSchemaVersion } from './migrations.js';
import { hasTable, isDatabaseSound, readSchemaVersion } from './repositories/schema.js';

import type { Db } from './connection.js';

/** The tables every Morgue File library has had since its first schema. */
const LIBRARY_TABLES = ['items', 'roots', 'fields', 'tags', 'collections', 'models'] as const;

/** Refuses a database that isn't a sound Morgue File library this version of the app can open. */
function requireRestorableLibrary(db: Db, latestVersion: number): void {
  const version = readSchemaVersion(db);
  if (version < 1 || !LIBRARY_TABLES.every((table) => hasTable(db, table))) {
    throw new AppError('invalid-backup', 'That zip holds no Morgue File library.');
  }
  if (version > latestVersion) {
    throw new AppError(
      'invalid-backup',
      'That backup was made by a newer Morgue File. Update Morgue File, then restore it.',
    );
  }
  if (!isDatabaseSound(db)) {
    throw new AppError('invalid-backup', 'The library in that backup is damaged.');
  }
}

/**
 * Checks a database file read out of a backup, opened read-only so the check can't change it.
 * An older schema is fine: the library migrates it when it opens.
 */
export function checkRestoredDatabase(file: string, latestVersion = latestSchemaVersion()): void {
  let db: Db;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
  } catch {
    throw new AppError('invalid-backup', 'The library in that backup could not be opened.');
  }
  try {
    requireRestorableLibrary(db, latestVersion);
  } catch (error) {
    // SQLite reports a file that isn't a database only once it is first read.
    throw error instanceof AppError
      ? error
      : new AppError('invalid-backup', 'That zip holds no Morgue File library.');
  } finally {
    db.close();
  }
}

/**
 * Makes a copy of a database file the data folder's library.db, while no connection has it open.
 * The old write-ahead log and its index go first: left beside the new file, SQLite would replay
 * the old library's last changes into it.
 */
export async function replaceLibraryFile(dataDir: string, sourceFile: string): Promise<void> {
  const libraryFile = path.join(dataDir, LIBRARY_FILE_NAME);
  await rm(`${libraryFile}-wal`, { force: true });
  await rm(`${libraryFile}-shm`, { force: true });
  await copyFile(sourceFile, libraryFile);
}
