// The items an Index page lists: one page of a compiled query, its count, and its count per
// section (docs/ARCHITECTURE.md, Paging and Prev/Next).
import { optional } from './sql-values.js';

import type { CompiledQuery } from '#core/query/compile-query.js';
import type { Db } from '../connection.js';
import type { ItemKind, Section, ThumbState } from './items.js';

/** One thumbnail's worth of an item: enough to draw it and its caption. */
export type ListedItem = {
  readonly id: number;
  readonly relPath: string;
  readonly kind: ItemKind;
  readonly section: Section;
  /** The subcategory's name, or undefined for Unsorted. */
  readonly subcategoryName: string | undefined;
  readonly width: number | undefined;
  readonly height: number | undefined;
  readonly durationMs: number | undefined;
  readonly pageCount: number | undefined;
  readonly thumbState: ThumbState;
  /** The file's modified time, so a changed file's thumbnail gets a new URL. */
  readonly mtimeMs: number;
};

/** Which page of results to read. */
export type PageWindow = {
  readonly limit: number;
  readonly offset: number;
};

/**
 * The order of every list: Photos, then Video, then Library, so mixed search results read by
 * section; within a section, oldest first by date added, the order the folders hold them.
 */
const LIST_ORDER = `CASE items.section WHEN 'photos' THEN 1 WHEN 'video' THEN 2 ELSE 3 END,
  items.added_at, items.id`;

type ListedItemRow = {
  id: number;
  rel_path: string;
  kind: ItemKind;
  section: Section;
  subcategory_name: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  page_count: number | null;
  thumb_state: ThumbState;
  mtime: number;
};

/** One page of the items a query matches, in list order. */
export function findItemsByQuery(db: Db, query: CompiledQuery, window: PageWindow): ListedItem[] {
  const rows = db
    .prepare(
      `SELECT items.id, items.rel_path, items.kind, items.section, items.width, items.height,
         items.duration_ms, items.page_count, items.thumb_state, items.mtime,
         subcategories.name AS subcategory_name
       FROM items LEFT JOIN subcategories ON subcategories.id = items.subcategory_id
       WHERE ${query.where}
       ORDER BY ${LIST_ORDER}
       LIMIT ? OFFSET ?`,
    )
    .all(...query.params, window.limit, window.offset) as ListedItemRow[];
  return rows.map(toListedItem);
}

/** How many items a query matches. */
export function countItemsByQuery(db: Db, query: CompiledQuery): number {
  const row = db
    .prepare(`SELECT count(*) AS total FROM items WHERE ${query.where}`)
    .get(...query.params) as { total: number };
  return row.total;
}

/** How many items a query matches in each section, for "34 in Photos, 4 in Library". */
export function countItemsBySectionByQuery(db: Db, query: CompiledQuery): Map<Section, number> {
  const rows = db
    .prepare(
      `SELECT items.section, count(*) AS total FROM items WHERE ${query.where}
       GROUP BY items.section`,
    )
    .all(...query.params) as { section: Section; total: number }[];
  return new Map(rows.map((row) => [row.section, row.total]));
}

function toListedItem(row: ListedItemRow): ListedItem {
  return {
    id: row.id,
    relPath: row.rel_path,
    kind: row.kind,
    section: row.section,
    subcategoryName: optional(row.subcategory_name),
    width: optional(row.width),
    height: optional(row.height),
    durationMs: optional(row.duration_ms),
    pageCount: optional(row.page_count),
    thumbState: row.thumb_state,
    mtimeMs: row.mtime,
  };
}
