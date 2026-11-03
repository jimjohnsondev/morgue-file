// Group-by for Index pages (R13): a subcategory's items gathered by the value of one field, as
// Magazines gathers issues by title, and one group's items ordered by a date field.
import { optional } from './sql-values.js';

import type { Db } from '../connection.js';
import type { ListedItem } from './item-lists.js';
import type { ItemKind, Section, ThumbState } from './items.js';

/** One value of the grouping field, how many items have it, and the newest one's id. */
export type FieldGroup = {
  readonly value: string;
  readonly itemCount: number;
  /** The item with the latest date, shown as the group's cover, and its file time. */
  readonly coverItemId: number;
  readonly coverMtimeMs: number;
};

/** A listed item with the date it is ordered by (an issue date), if it has one. */
export type DatedItem = ListedItem & { readonly date: string | undefined };

/** Which items to group: a subcategory, the field to group by and the date field to order by. */
export type GroupSpec = {
  readonly subcategoryId: number;
  readonly groupFieldKey: string;
  readonly dateFieldKey: string;
};

/** SQL for an item's text value of the field whose key is the next parameter. */
const ITEM_VALUE = `SELECT field_values.value_text FROM field_values
  WHERE field_values.entity = 'item' AND field_values.entity_id = items.id
    AND field_values.field_id = (SELECT id FROM fields WHERE entity = 'item' AND key = ? AND removed_at IS NULL)`;

/** The groups of a subcategory's items, alphabetically by value. Items with no value are left out. */
export function findFieldGroups(db: Db, spec: GroupSpec): FieldGroup[] {
  const rows = db
    .prepare(
      `WITH valued AS (
         SELECT items.id, (${ITEM_VALUE}) AS value, (${ITEM_VALUE}) AS date
         FROM items WHERE items.subcategory_id = ?
       )
       , grouped AS (
         SELECT value, count(*) AS item_count,
           (SELECT inner_valued.id FROM valued AS inner_valued
            WHERE inner_valued.value = valued.value
            ORDER BY inner_valued.date DESC, inner_valued.id DESC LIMIT 1) AS cover_item_id
         FROM valued WHERE value IS NOT NULL GROUP BY value
       )
       SELECT grouped.value, grouped.item_count, grouped.cover_item_id, items.mtime AS cover_mtime
       FROM grouped JOIN items ON items.id = grouped.cover_item_id
       ORDER BY grouped.value COLLATE NOCASE`,
    )
    .all(spec.groupFieldKey, spec.dateFieldKey, spec.subcategoryId) as {
    value: string;
    item_count: number;
    cover_item_id: number;
    cover_mtime: number;
  }[];
  return rows.map((row) => ({
    value: row.value,
    itemCount: row.item_count,
    coverItemId: row.cover_item_id,
    coverMtimeMs: row.cover_mtime,
  }));
}

type DatedItemRow = {
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
  date: string | null;
};

/** One group's items, newest date first; items with no date come last. */
export function findItemsInFieldGroup(db: Db, spec: GroupSpec, value: string): DatedItem[] {
  const rows = db
    .prepare(
      `SELECT items.id, items.rel_path, items.kind, items.section, items.width, items.height,
         items.duration_ms, items.page_count, items.thumb_state, items.mtime,
         subcategories.name AS subcategory_name, (${ITEM_VALUE}) AS date
       FROM items LEFT JOIN subcategories ON subcategories.id = items.subcategory_id
       WHERE items.subcategory_id = ? AND (${ITEM_VALUE}) = ?
       ORDER BY date IS NULL, date DESC, items.id DESC`,
    )
    .all(spec.dateFieldKey, spec.subcategoryId, spec.groupFieldKey, value) as DatedItemRow[];
  return rows.map((row) => ({
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
    date: optional(row.date),
  }));
}
