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

function toRoot(row: RootRow): Root {
  return {
    id: row.id,
    path: row.path,
    label: row.label,
    status: row.status,
    lastScanAt: optional(row.last_scan_at),
  };
}
