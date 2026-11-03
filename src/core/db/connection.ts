// Opens library.db with the settings every connection needs (docs/ARCHITECTURE.md, Data model).
import Database from 'better-sqlite3';

/** An open SQLite connection. The main thread holds the one that writes. */
export type Db = Database.Database;

/** The database file in the data folder. Its presence means the folder already holds a library. */
export const LIBRARY_FILE_NAME = 'library.db';

/**
 * Opens a database file, creating it if needed. WAL lets pages read while the indexer writes, and
 * the busy timeout covers the moment a checkpoint holds the file.
 */
export function openDatabase(file: string): Db {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}
