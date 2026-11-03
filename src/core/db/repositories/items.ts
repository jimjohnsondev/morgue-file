// Items: one row per original file or page folder. Items are never deleted; a file that goes away
// gets missing_since instead.
import { optional } from './sql-values.js';

import type { Db } from '../connection.js';

/** What an item is, decided by its extension or folder shape (docs/ARCHITECTURE.md). */
export type ItemKind = 'image' | 'video' | 'pdf' | 'cbz' | 'pagefolder';

/** A media section: one tab in the tab bar. */
export type Section = 'photos' | 'video' | 'library';

/** Whether an item's default thumbnail has been made. */
export type ThumbState = 'pending' | 'ready' | 'failed';

/** The section each kind belongs to. The section is stored so pages filter on an index. */
export const SECTION_BY_KIND: Readonly<Record<ItemKind, Section>> = {
  image: 'photos',
  video: 'video',
  pdf: 'library',
  cbz: 'library',
  pagefolder: 'library',
};

/** A file found under a root, before it has an id. Unknown media details are undefined. */
export type NewItem = {
  readonly rootId: number;
  /** Relative to the root, with forward slashes. */
  readonly relPath: string;
  readonly kind: ItemKind;
  readonly size: number;
  readonly mtimeMs: number;
  readonly addedAt: string;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
  readonly fps?: number;
  readonly pageCount?: number;
};

/** An item as stored. */
export type Item = {
  readonly id: number;
  readonly rootId: number;
  readonly relPath: string;
  readonly kind: ItemKind;
  readonly section: Section;
  /** Undefined means Unsorted. */
  readonly subcategoryId: number | undefined;
  /** True once the item was filed by hand, so scans and folder mappings leave it alone. */
  readonly isFiledByHand: boolean;
  readonly size: number;
  readonly mtimeMs: number;
  readonly width: number | undefined;
  readonly height: number | undefined;
  readonly durationMs: number | undefined;
  readonly fps: number | undefined;
  readonly pageCount: number | undefined;
  readonly addedAt: string;
  readonly missingSince: string | undefined;
  readonly thumbState: ThumbState;
};

type ItemRow = {
  id: number;
  root_id: number;
  rel_path: string;
  kind: ItemKind;
  section: Section;
  subcategory_id: number | null;
  subcategory_manual: 0 | 1;
  size: number;
  mtime: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  fps: number | null;
  page_count: number | null;
  added_at: string;
  missing_since: string | null;
  thumb_state: ThumbState;
};

/**
 * SQL for the subcategory of the longest folder mapping that holds a path, matched on whole
 * folder names (Figure/ holds Figure/a.jpg but not Figures/a.jpg). Insert and refiling share it,
 * so both follow the same rule. The arguments are fixed SQL (a `?` or a column), never values.
 */
function mappedSubcategorySql(
  rootId: '?' | 'items.root_id',
  relPath: '?' | 'items.rel_path',
): string {
  return `(
    SELECT mapping.subcategory_id FROM folder_mappings AS mapping
    WHERE mapping.root_id = ${rootId}
      AND lower(substr(${relPath}, 1, length(mapping.rel_prefix) + 1))
        = lower(mapping.rel_prefix || '/')
    ORDER BY length(mapping.rel_prefix) DESC
    LIMIT 1
  )`;
}

/** Adds an item, filed by the folder mappings that hold it, and returns its id. */
export function insertItem(db: Db, item: NewItem): number {
  const result = db
    .prepare(
      `INSERT INTO items (root_id, rel_path, kind, section, subcategory_id, size, mtime, width,
         height, duration_ms, fps, page_count, added_at)
       VALUES (?, ?, ?, ?, ${mappedSubcategorySql('?', '?')}, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      item.rootId,
      item.relPath,
      item.kind,
      SECTION_BY_KIND[item.kind],
      item.rootId,
      item.relPath,
      item.size,
      item.mtimeMs,
      item.width ?? null,
      item.height ?? null,
      item.durationMs ?? null,
      item.fps ?? null,
      item.pageCount ?? null,
      item.addedAt,
    );
  return Number(result.lastInsertRowid);
}

/** Returns an item by id, or undefined if there is none. */
export function findItemById(db: Db, id: number): Item | undefined {
  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined;
  return row === undefined ? undefined : toItem(row);
}

/** Returns the item at a path under a root, ignoring case as Windows does. */
export function findItemByPath(db: Db, rootId: number, relPath: string): Item | undefined {
  const row = db
    .prepare('SELECT * FROM items WHERE root_id = ? AND rel_path = ?')
    .get(rootId, relPath) as ItemRow | undefined;
  return row === undefined ? undefined : toItem(row);
}

/** Every item's id by its path under a root, for matching names from a seed or a scan. */
export function findItemIdsByPath(db: Db, rootId: number): Map<string, number> {
  const rows = db
    .prepare('SELECT id, rel_path FROM items WHERE root_id = ? ORDER BY id')
    .all(rootId) as Pick<ItemRow, 'id' | 'rel_path'>[];
  return new Map(rows.map((row) => [row.rel_path, row.id]));
}

/** Files items by hand (R5), so later scans and mapping changes leave them where they were put. */
export function fileItemsByHand(
  db: Db,
  itemIds: readonly number[],
  subcategoryId: number | undefined,
): void {
  const fileOne = db.prepare(
    'UPDATE items SET subcategory_id = ?, subcategory_manual = 1 WHERE id = ?',
  );
  db.transaction(() => {
    for (const itemId of itemIds) {
      fileOne.run(subcategoryId ?? null, itemId);
    }
  })();
}

/**
 * Re-files every item under a root that wasn't filed by hand, after the folder mappings changed.
 * Returns how many items it looked at.
 */
export function refileItemsByMappings(db: Db, rootId: number): number {
  const mapped = mappedSubcategorySql('items.root_id', 'items.rel_path');
  const result = db
    .prepare(
      `UPDATE items SET subcategory_id = ${mapped} WHERE root_id = ? AND subcategory_manual = 0`,
    )
    .run(rootId);
  return result.changes;
}

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    rootId: row.root_id,
    relPath: row.rel_path,
    kind: row.kind,
    section: row.section,
    subcategoryId: optional(row.subcategory_id),
    isFiledByHand: row.subcategory_manual === 1,
    size: row.size,
    mtimeMs: row.mtime,
    width: optional(row.width),
    height: optional(row.height),
    durationMs: optional(row.duration_ms),
    fps: optional(row.fps),
    pageCount: optional(row.page_count),
    addedAt: row.added_at,
    missingSince: optional(row.missing_since),
    thumbState: row.thumb_state,
  };
}
