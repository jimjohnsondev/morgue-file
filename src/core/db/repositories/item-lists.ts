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

/** Photos, then Video, then Library, so mixed search results read by section. */
const SECTION_RANK = `CASE items.section WHEN 'photos' THEN 1 WHEN 'video' THEN 2 ELSE 3 END`;

/**
 * The columns of every list's order: by section, then oldest first by date added, the order the
 * folders hold them. A list within one section leaves out the section rank, so the
 * items_in_list_order index gives the order and a deep page needn't sort the whole section (R18).
 */
function listColumns(query: CompiledQuery): string[] {
  const withinSection = ['items.added_at', 'items.id'];
  return query.isOneSection ? withinSection : [SECTION_RANK, ...withinSection];
}

/** The ORDER BY of a list, oldest first, or newest first to look backwards from an item. */
function listOrder(query: CompiledQuery, direction: 'ASC' | 'DESC' = 'ASC'): string {
  return listColumns(query)
    .map((column) => `${column} ${direction}`)
    .join(', ');
}

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

/**
 * One page of the items a query matches, in list order. The page's ids are found first, from
 * the index alone, and only those rows are joined for display.
 */
export function findItemsByQuery(db: Db, query: CompiledQuery, window: PageWindow): ListedItem[] {
  const order = listOrder(query);
  const rows = db
    .prepare(
      `WITH page AS (
         SELECT items.id FROM items WHERE ${query.where} ORDER BY ${order} LIMIT ? OFFSET ?
       )
       SELECT items.id, items.rel_path, items.kind, items.section, items.width, items.height,
         items.duration_ms, items.page_count, items.thumb_state, items.mtime,
         subcategories.name AS subcategory_name
       FROM page JOIN items ON items.id = page.id
       LEFT JOIN subcategories ON subcategories.id = items.subcategory_id
       ORDER BY ${order}`,
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

/** Where one item sits in a list: how many come before it, and the items either side. */
export type ListPlace = {
  /** 1 for the first item. */
  readonly position: number;
  readonly previousId: number | undefined;
  readonly nextId: number | undefined;
};

/**
 * A condition comparing each item's place in the list with one item's, as row values, so
 * neighbours and positions are keyset lookups on the list's index.
 */
function comparedWithItem(query: CompiledQuery, comparison: '<' | '>'): string {
  const columns = listColumns(query).join(', ');
  return `(${columns}) ${comparison} (SELECT ${columns} FROM items WHERE items.id = ?)`;
}

/** The id of the item next to the one given, before or after it in list order. */
function findNeighbourId(
  db: Db,
  query: CompiledQuery,
  place: { readonly itemId: number; readonly direction: 'before' | 'after' },
): number | undefined {
  const isBefore = place.direction === 'before';
  const row = db
    .prepare(
      `SELECT items.id FROM items
       WHERE (${query.where}) AND ${comparedWithItem(query, isBefore ? '<' : '>')}
       ORDER BY ${listOrder(query, isBefore ? 'DESC' : 'ASC')} LIMIT 1`,
    )
    .get(...query.params, place.itemId) as { id: number } | undefined;
  return row?.id;
}

/**
 * Where an item sits in a query's list (R19): its position for "3 of 1,236", and the items
 * before and after it for Prev and Next. Undefined if the query doesn't list the item.
 */
export function findListPlace(db: Db, query: CompiledQuery, itemId: number): ListPlace | undefined {
  const isListed = db
    .prepare(`SELECT 1 FROM items WHERE (${query.where}) AND items.id = ?`)
    .get(...query.params, itemId);
  if (isListed === undefined) {
    return undefined;
  }
  const row = db
    .prepare(
      `SELECT count(*) AS before FROM items
       WHERE (${query.where}) AND ${comparedWithItem(query, '<')}`,
    )
    .get(...query.params, itemId) as { before: number };
  return {
    position: row.before + 1,
    previousId: findNeighbourId(db, query, { itemId, direction: 'before' }),
    nextId: findNeighbourId(db, query, { itemId, direction: 'after' }),
  };
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
