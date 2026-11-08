// The items an Index page lists: one page of a compiled query, its count, and its count per
// section (docs/ARCHITECTURE.md, Paging and Prev/Next).
import { SECTION_RANK } from '#core/query/group-order.js';

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

/** A listed item with the value of the field its list is grouped by (R13), if it is grouped. */
export type GroupedItem = ListedItem & {
  readonly groupValue: string | number | undefined;
};

/** Which page of results to read. */
export type PageWindow = {
  readonly limit: number;
  readonly offset: number;
};

/**
 * The columns of every list's order: by section, then oldest first by date added, the order the
 * folders hold them. A list within one section leaves out the section rank, so the
 * items_in_list_order index gives the order and a deep page needn't sort the whole section (R18).
 * A grouped list puts its groups' columns first.
 */
function listColumns(query: CompiledQuery): string[] {
  const groupColumns = query.group?.columns ?? [];
  const withinSection = ['items.added_at', 'items.id'];
  // A grouping that already sorts by section (by subcategory) needs no second section rank.
  const isSorted = query.isOneSection || groupColumns.includes(SECTION_RANK);
  return [...groupColumns, ...(isSorted ? withinSection : [SECTION_RANK, ...withinSection])];
}

/**
 * The common table expressions a statement starts with: the grouping's, if it has one, then the
 * statement's own. Its parameters come before every other, as the text reads.
 */
function withTables(query: CompiledQuery, ...own: string[]): string {
  const tables = [...(query.group?.cte === undefined ? [] : [query.group.cte.sql]), ...own];
  return tables.length === 0 ? '' : `WITH ${tables.join(', ')}`;
}

/** The parameters of the grouping's table expression, which go first. */
function groupParams(query: CompiledQuery): readonly string[] {
  return query.group?.cte?.params ?? [];
}

/** The ORDER BY of a list, oldest first, or newest first to look backwards from an item. */
function listOrder(query: CompiledQuery, direction: 'ASC' | 'DESC' = 'ASC'): string {
  return listColumns(query)
    .map((column) => `${column} ${direction}`)
    .join(', ');
}

/** What a thumbnail needs, read from items joined to subcategories. */
const LISTED_COLUMNS = `items.id, items.rel_path, items.kind, items.section, items.width,
  items.height, items.duration_ms, items.page_count, items.thumb_state, items.mtime,
  subcategories.name AS subcategory_name`;

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
export function findItemsByQuery(db: Db, query: CompiledQuery, window: PageWindow): GroupedItem[] {
  const rows = db
    .prepare(
      `${withTables(query, `page AS (${pageIdsSql(query)})`)}
       SELECT ${LISTED_COLUMNS}, ${query.group?.value ?? 'NULL'} AS group_value
       FROM page JOIN items ON items.id = page.id
       LEFT JOIN subcategories ON subcategories.id = items.subcategory_id
       ORDER BY ${listOrder(query)}`,
    )
    .all(...groupParams(query), ...query.params, window.limit, window.offset) as (ListedItemRow & {
    group_value: string | number | null;
  })[];
  return rows.map((row) => ({ ...toListedItem(row), groupValue: optional(row.group_value) }));
}

/** The ids of one page of a query, in list order; its last two placeholders are LIMIT, OFFSET. */
function pageIdsSql(query: CompiledQuery): string {
  return `SELECT items.id FROM items WHERE ${query.where} ORDER BY ${listOrder(query)}
    LIMIT ? OFFSET ?`;
}

/**
 * How SQLite plans to find one page of a query: one line per step. Snapshot tests of these catch
 * a lost index before the perf timings do (docs/ARCHITECTURE.md, Search).
 */
export function explainItemsByQuery(db: Db, query: CompiledQuery): string[] {
  const rows = db
    .prepare(`EXPLAIN QUERY PLAN ${withTables(query)} ${pageIdsSql(query)}`)
    .all(...groupParams(query), ...query.params, 96, 0) as { detail: string }[];
  return rows.map((row) => row.detail);
}

/** Every item id a query matches, in list order, for a bulk action on a whole list (R10). */
export function findItemIdsByQuery(db: Db, query: CompiledQuery): number[] {
  const rows = db
    .prepare(
      `${withTables(query)} SELECT items.id FROM items WHERE ${query.where}
       ORDER BY ${listOrder(query)}`,
    )
    .all(...groupParams(query), ...query.params) as { id: number }[];
  return rows.map((row) => row.id);
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

type GroupCountRow = { group_value: string | number | null; total: number };

/**
 * How many items a grouped query matches in each of its groups, by group value; items without a
 * value are counted under undefined. Empty for a list that isn't grouped.
 */
export function countItemsByGroupByQuery(
  db: Db,
  query: CompiledQuery,
): Map<string | number | undefined, number> {
  if (query.group === undefined) {
    return new Map();
  }
  if (query.group.valueOfRow !== undefined) {
    return countItemsByFieldGroup(db, query, query.group.valueOfRow);
  }
  const rows = db
    .prepare(
      `${withTables(query)} SELECT ${query.group.value} AS group_value, count(*) AS total
       FROM items WHERE ${query.where} GROUP BY ${query.group.countedBy}`,
    )
    .all(...groupParams(query), ...query.params) as GroupCountRow[];
  return new Map(rows.map((row) => [optional(row.group_value), row.total]));
}

/**
 * The groups of a list grouped by a field, counted from the field's own rows rather than by
 * reading the field for every item (R18): only items with a value have a row. The items
 * without a value are the rest of the list.
 */
function countItemsByFieldGroup(
  db: Db,
  query: CompiledQuery,
  valueOfRow: string,
): Map<string | number | undefined, number> {
  const rows = db
    .prepare(
      `${withTables(query)} SELECT ${valueOfRow} AS group_value, count(*) AS total
       FROM field_values AS group_values JOIN items ON items.id = group_values.entity_id
       WHERE group_values.entity = 'item'
         AND group_values.field_id = (SELECT field_id FROM list_group)
         AND (${query.where})
       GROUP BY group_value`,
    )
    .all(...groupParams(query), ...query.params) as GroupCountRow[];
  const counts = new Map<string | number | undefined, number>();
  let withValue = 0;
  for (const row of rows) {
    if (row.group_value !== null) {
      counts.set(row.group_value, row.total);
      withValue += row.total;
    }
  }
  const withoutValue = countItemsByQuery(db, query) - withValue;
  if (withoutValue > 0) {
    counts.set(undefined, withoutValue);
  }
  return counts;
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
      `${withTables(query)} SELECT items.id FROM items
       WHERE (${query.where}) AND ${comparedWithItem(query, isBefore ? '<' : '>')}
       ORDER BY ${listOrder(query, isBefore ? 'DESC' : 'ASC')} LIMIT 1`,
    )
    .get(...groupParams(query), ...query.params, place.itemId) as { id: number } | undefined;
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
      `${withTables(query)} SELECT count(*) AS before FROM items
       WHERE (${query.where}) AND ${comparedWithItem(query, '<')}`,
    )
    .get(...groupParams(query), ...query.params, itemId) as { before: number };
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

/** Items by id, in the order given; ids with no item are left out. */
export function findListedItemsByIds(db: Db, ids: readonly number[]): ListedItem[] {
  const rows = db
    .prepare(
      `SELECT ${LISTED_COLUMNS} FROM json_each(?) AS wanted
       JOIN items ON items.id = wanted.value
       LEFT JOIN subcategories ON subcategories.id = items.subcategory_id
       ORDER BY wanted.key`,
    )
    .all(JSON.stringify(ids)) as ListedItemRow[];
  return rows.map(toListedItem);
}

/** The items added last, newest first, for Home's Recently added strip (R34). */
export function findNewestItems(db: Db, limit: number): ListedItem[] {
  const rows = db
    .prepare(
      `SELECT ${LISTED_COLUMNS} FROM items
       LEFT JOIN subcategories ON subcategories.id = items.subcategory_id
       ORDER BY items.added_at DESC, items.id DESC LIMIT ?`,
    )
    .all(limit) as ListedItemRow[];
  return rows.map(toListedItem);
}

/** The prime the shuffle works modulo; ids and multipliers stay below it. */
const SHUFFLE_PRIME = 4294967291;

/**
 * The multiplier a seed shuffles by. The seed changes the multiplier rather than adding an
 * offset, because an offset would only rotate the order and most seeds would pick the same items.
 */
function shuffleMultiplier(seed: number): number {
  // A zero multiplier would give every id the same key, so it falls back to 1.
  return (2654435761 + seed * 2246822519) % SHUFFLE_PRIME || 1;
}

/**
 * A shuffled handful of items for Home's From the archive strip (R34). The same seed always
 * picks the same items, so "shuffle" is a link and a page can be screenshot; the order comes
 * from multiplying each id by a large number modulo a prime, which scatters neighbours.
 */
export function findPickedItems(
  db: Db,
  pick: { readonly seed: number; readonly limit: number },
): ListedItem[] {
  const multiplier = shuffleMultiplier(pick.seed);
  const rows = db
    .prepare(
      `WITH picked AS (
         SELECT id, (id * ?) % ? AS shuffled FROM items ORDER BY shuffled, id LIMIT ?
       )
       SELECT ${LISTED_COLUMNS} FROM picked JOIN items ON items.id = picked.id
       LEFT JOIN subcategories ON subcategories.id = items.subcategory_id
       ORDER BY picked.shuffled, items.id`,
    )
    .all(multiplier, SHUFFLE_PRIME, pick.limit) as ListedItemRow[];
  return rows.map(toListedItem);
}
