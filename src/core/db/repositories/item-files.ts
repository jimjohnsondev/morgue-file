// What the scanner and the thumbnail jobs read and write about items' files: size and time,
// missing files, and the media details a thumbnail job finds.
import { optional } from './sql-values.js';

import type { Db } from '../connection.js';
import type { ItemKind, ThumbState } from './items.js';

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

/** An item whose file a dropped file may be a copy of, with where to read that file. */
export type CopyCandidate = {
  readonly id: number;
  readonly rootPath: string;
  readonly relPath: string;
  readonly partialHash: string | undefined;
};

type CopyCandidateRow = {
  id: number;
  root_path: string;
  rel_path: string;
  partial_hash: string | null;
};

/**
 * The items a dropped file may be a copy of (R8): the same kind and size, with the file there
 * now on a root that is online, so it can be read to confirm. Oldest first.
 */
export function findCopyCandidates(
  db: Db,
  file: { readonly kind: ItemKind; readonly size: number },
): CopyCandidate[] {
  const rows = db
    .prepare(
      `SELECT items.id, roots.path AS root_path, items.rel_path, items.partial_hash
       FROM items JOIN roots ON roots.id = items.root_id
       WHERE items.kind = ? AND items.size = ? AND items.missing_since IS NULL
         AND roots.status = 'online'
       ORDER BY items.id`,
    )
    .all(file.kind, file.size) as CopyCandidateRow[];
  return rows.map((row) => ({
    id: row.id,
    rootPath: row.root_path,
    relPath: row.rel_path,
    partialHash: optional(row.partial_hash),
  }));
}

/**
 * Removes items for good, with what nothing else cleans up: their field values (which have no
 * foreign key, so they would pass to a new item given a reused id) and their search rows. Tags,
 * collections, model links, views and jobs go with them by cascade. Only for items that were never
 * references (system clutter) or whose file now belongs to a page folder; a vanished file is
 * marked missing instead.
 */
export function removeItems(db: Db, ids: readonly number[]): void {
  const deleteFields = db.prepare(
    "DELETE FROM field_values WHERE entity = 'item' AND entity_id = ?",
  );
  const deleteSearch = db.prepare('DELETE FROM item_search WHERE rowid = ?');
  const deleteItem = db.prepare('DELETE FROM items WHERE id = ?');
  db.transaction(() => {
    for (const id of ids) {
      deleteFields.run(id);
      deleteSearch.run(id);
      deleteItem.run(id);
    }
  })();
}

/**
 * Keeps only the items with nothing attached: no tags, collections, model links or field values,
 * not filed by hand, and no model's portrait. The scanner removes only those; anything Jim has
 * filed, chosen or written stays (as a missing item).
 */
export function findUnattachedItemIds(db: Db, ids: readonly number[]): number[] {
  const isAttached = db.prepare(
    `SELECT EXISTS (SELECT 1 FROM item_tags WHERE item_id = :id)
         OR EXISTS (SELECT 1 FROM collection_items WHERE item_id = :id)
         OR EXISTS (SELECT 1 FROM item_models WHERE item_id = :id)
         OR EXISTS (SELECT 1 FROM field_values WHERE entity = 'item' AND entity_id = :id)
         OR EXISTS (SELECT 1 FROM items WHERE id = :id AND subcategory_manual = 1)
         OR EXISTS (SELECT 1 FROM models WHERE portrait_item_id = :id)
         AS attached`,
  );
  return ids.filter((id) => (isAttached.get({ id }) as { attached: number }).attached === 0);
}
