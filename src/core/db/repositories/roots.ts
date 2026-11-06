// Reference roots. The Reference folder is root 1; later roots are watched folders (R36).
import { optional } from './sql-values.js';

import type { Db } from '../connection.js';

/** The id of the Reference folder's root. */
export const REFERENCE_ROOT_ID = 1;

/** Whether a root's folder could be reached at its last check. */
export type RootStatus = 'online' | 'offline';

/** A folder Morgue File indexes. Items store a path relative to it. */
export type Root = {
  readonly id: number;
  readonly path: string;
  readonly label: string;
  readonly status: RootStatus;
  readonly lastScanAt: string | undefined;
};

type RootRow = {
  id: number;
  path: string;
  label: string;
  status: RootStatus;
  last_scan_at: string | null;
};

/**
 * Points root 1 at the Reference folder, creating it the first time. Only the path changes on a
 * move, so items keep their relative paths and nothing is re-indexed (a new drive letter is one
 * edit).
 */
export function setReferenceRoot(db: Db, folder: string): void {
  db.prepare(
    `INSERT INTO roots (id, path, label) VALUES (?, ?, 'Reference')
     ON CONFLICT (id) DO UPDATE SET path = excluded.path`,
  ).run(REFERENCE_ROOT_ID, folder);
}

/** Every root, the Reference folder first, then watched folders in the order they were added. */
export function findAllRoots(db: Db): Root[] {
  const rows = db.prepare('SELECT * FROM roots ORDER BY id').all() as RootRow[];
  return rows.map(toRoot);
}

/** Adds a watched folder as a new root and returns its id. */
export function insertRoot(db: Db, folder: string, label: string): number {
  const result = db.prepare('INSERT INTO roots (path, label) VALUES (?, ?)').run(folder, label);
  return Number(result.lastInsertRowid);
}

/**
 * Points a root at its folder's new location. Items keep their relative paths, so nothing is
 * re-indexed: a new drive letter is one edit.
 */
export function setRootPath(db: Db, id: number, folder: string): void {
  db.prepare('UPDATE roots SET path = ? WHERE id = ?').run(folder, id);
}

/** Returns a root by id, or undefined if there is none. */
export function findRootById(db: Db, id: number): Root | undefined {
  const row = db.prepare('SELECT * FROM roots WHERE id = ?').get(id) as RootRow | undefined;
  return row === undefined ? undefined : toRoot(row);
}

/** Records whether a root's folder is reachable, so pages can show E3 while it's offline. */
export function setRootStatus(db: Db, id: number, status: RootStatus): void {
  db.prepare('UPDATE roots SET status = ? WHERE id = ?').run(status, id);
}

/** Records a finished scan: the root was reachable, and when it was last read in full. */
export function markRootScanned(db: Db, id: number, now: string): void {
  db.prepare(`UPDATE roots SET status = 'online', last_scan_at = ? WHERE id = ?`).run(now, id);
}

/** Counts a root's items that weren't missing at its last scan: what an offline drive keeps (E3). */
export function countKeptItems(db: Db, rootId: number): number {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM items WHERE root_id = ? AND missing_since IS NULL')
    .get(rootId) as { count: number };
  return row.count;
}

/**
 * Counts the kept items in a folder under a root, by its relative path (`Inbox`), ignoring case.
 * The pattern escapes LIKE's wildcards, so a folder named `100%` matches only itself.
 */
export function countKeptItemsUnder(db: Db, rootId: number, relFolder: string): number {
  const pattern = `${relFolder.replaceAll(/[\\%_]/g, (char) => `\\${char}`)}/%`;
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM items
       WHERE root_id = ? AND missing_since IS NULL AND rel_path LIKE ? ESCAPE '\\'`,
    )
    .get(rootId, pattern) as { count: number };
  return row.count;
}

function toRoot(row: RootRow): Root {
  return {
    id: row.id,
    path: row.path,
    label: row.label,
    status: row.status,
    lastScanAt: optional(row.last_scan_at),
  };
}
