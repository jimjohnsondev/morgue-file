// What the scanner and the thumbnail jobs read and write about items' files: size and time,
// missing files, and the media details a thumbnail job finds.
import { optional } from './sql-values.js';

import type { ItemKind, ThumbState } from './items.js';
import type { Db } from '../connection.js';

/**
 * What a scan compares with the file it finds at an item's path, and what tells a moved file
 * from a new one (docs/ARCHITECTURE.md, Moves).
 */
export type ScanState = {
  readonly id: number;
  readonly relPath: string;
  readonly kind: ItemKind;
  readonly size: number;
  readonly mtimeMs: number;
  /** When a scan last failed to find the file, or undefined while it is there. */
  readonly missingSince: string | undefined;
  /** The file's partial hash, once its thumbnail job has worked it out. */
  readonly partialHash: string | undefined;
};

/** Which items a scan of part of a root compares with: one folder alone, or a whole subtree. */
export type ScanScope = {
  readonly relDir: string;
  readonly isShallow: boolean;
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
  kind: ItemKind;
  size: number;
  mtime: number;
  missing_since: string | null;
  partial_hash: string | null;
};

const SCAN_STATE_COLUMNS = 'id, rel_path, kind, size, mtime, missing_since, partial_hash';

function toScanState(row: ScanStateRow): ScanState {
  return {
    id: row.id,
    relPath: row.rel_path,
    kind: row.kind,
    size: row.size,
    mtimeMs: row.mtime,
    missingSince: optional(row.missing_since),
    partialHash: optional(row.partial_hash),
  };
}

/** Every item under a root with its stored size and time, for a scan to compare against. */
export function findScanStates(db: Db, rootId: number): ScanState[] {
  const rows = db
    .prepare(`SELECT ${SCAN_STATE_COLUMNS} FROM items WHERE root_id = ?`)
    .all(rootId) as ScanStateRow[];
  return rows.map(toScanState);
}

/** Escapes LIKE's wildcards in a folder name, so `100%_done` matches only itself. */
function escapeLike(text: string): string {
  return text.replaceAll(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * The items at or under a folder, for the watcher's partial scans. A shallow scope also takes
 * the folder's grandchildren and deeper; the caller narrows them to the folder's own items.
 */
export function findScanStatesUnder(db: Db, rootId: number, scope: ScanScope): ScanState[] {
  if (scope.relDir === '') {
    return findScanStates(db, rootId);
  }
  const rows = db
    .prepare(
      `SELECT ${SCAN_STATE_COLUMNS} FROM items
       WHERE root_id = ? AND (rel_path = ? OR rel_path LIKE ? ESCAPE '\\')`,
    )
    .all(rootId, scope.relDir, `${escapeLike(scope.relDir)}/%`) as ScanStateRow[];
  return rows.map(toScanState);
}

/** Items under a root marked missing at or after a time: the files a move may have taken. */
export function findRecentlyMissing(db: Db, rootId: number, since: string): ScanState[] {
  const rows = db
    .prepare(`SELECT ${SCAN_STATE_COLUMNS} FROM items WHERE root_id = ? AND missing_since >= ?`)
    .all(rootId, since) as ScanStateRow[];
  return rows.map(toScanState);
}

/** Stores an item's partial hash, which lets a later scan recognize the file after a move. */
export function setItemPartialHash(db: Db, id: number, partialHash: string): void {
  db.prepare('UPDATE items SET partial_hash = ? WHERE id = ?').run(partialHash, id);
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
       partial_hash = NULL,
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
