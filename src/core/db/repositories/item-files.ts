// What the scanner and the thumbnail jobs read and write about items' files: size and time,
// missing files, and the media details a thumbnail job finds.
import { optional } from './sql-values.js';

import type { ThumbState } from './items.js';
import type { Db } from '../connection.js';

/** What a scan compares with the file it finds at an item's path. */
export type ScanState = {
  readonly id: number;
  readonly relPath: string;
  readonly size: number;
  readonly mtimeMs: number;
  readonly isMissing: boolean;
};

/** What a thumbnail job learns about an item's media. Unknown details are undefined. */
export type MediaDetails = {
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly durationMs?: number | undefined;
  readonly fps?: number | undefined;
  readonly pageCount?: number | undefined;
};

type ScanStateRow = {
  id: number;
  rel_path: string;
  size: number;
  mtime: number;
  missing_since: string | null;
};

/** Every item under a root with its stored size and time, for a scan to compare against. */
export function findScanStates(db: Db, rootId: number): ScanState[] {
  const rows = db
    .prepare('SELECT id, rel_path, size, mtime, missing_since FROM items WHERE root_id = ?')
    .all(rootId) as ScanStateRow[];
  return rows.map((row) => ({
    id: row.id,
    relPath: row.rel_path,
    size: row.size,
    mtimeMs: row.mtime,
    isMissing: optional(row.missing_since) !== undefined,
  }));
}

/**
 * Records that an item's file changed: the new size and time, found again if it was missing, and
 * its media details and thumbnail to be worked out afresh.
 */
export function updateItemFile(
  db: Db,
  change: { readonly id: number; readonly size: number; readonly mtimeMs: number },
): void {
  db.prepare(
    `UPDATE items SET size = ?, mtime = ?, missing_since = NULL, thumb_state = 'pending',
       width = NULL, height = NULL, duration_ms = NULL, fps = NULL, page_count = NULL
     WHERE id = ?`,
  ).run(change.size, change.mtimeMs, change.id);
}

/** Records that a missing item's file is back, unchanged. */
export function clearItemMissing(db: Db, id: number): void {
  db.prepare('UPDATE items SET missing_since = NULL WHERE id = ?').run(id);
}

/** Marks items whose files a scan didn't find. Items are never deleted (docs/ARCHITECTURE.md). */
export function markItemMissing(db: Db, id: number, now: string): void {
  db.prepare('UPDATE items SET missing_since = ? WHERE id = ? AND missing_since IS NULL').run(
    now,
    id,
  );
}

/** Stores what a thumbnail job found and marks the item's thumbnail ready. */
export function setItemMediaDetails(db: Db, id: number, details: MediaDetails): void {
  db.prepare(
    `UPDATE items SET width = ?, height = ?, duration_ms = ?, fps = ?, page_count = ?,
       thumb_state = 'ready'
     WHERE id = ?`,
  ).run(
    details.width ?? null,
    details.height ?? null,
    details.durationMs ?? null,
    details.fps ?? null,
    details.pageCount ?? null,
    id,
  );
}

/** Sets whether an item's default thumbnail is pending, ready or failed. */
export function setThumbState(db: Db, id: number, state: ThumbState): void {
  db.prepare('UPDATE items SET thumb_state = ? WHERE id = ?').run(state, id);
}
