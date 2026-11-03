// App settings kept in the library (thumbnail size and count, compare-board layout), as JSON text.
import type { Db } from '../connection.js';

/** Returns a setting's stored text, or undefined if it was never set. */
export function readSetting(db: Db, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string } | undefined;
  return row?.value;
}

/** Stores a setting, replacing any earlier value. */
export function writeSetting(db: Db, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}
