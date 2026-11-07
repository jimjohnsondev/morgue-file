// The order a grouped list is read in (R13): `group:rating` or `group:subcategory` puts every
// item with the same value together, groups in a fixed order, and the list's own order within
// each group. Like compile-query.ts, it writes SQL only from the fixed fragments below; the
// field's key is a bound parameter, never pasted into the text. Repositories run it.

/** Photos, then Video, then Library, so mixed lists and their groups read by section. */
export const SECTION_RANK = `CASE items.section WHEN 'photos' THEN 1 WHEN 'video' THEN 2 ELSE 3 END`;

/**
 * What a list is grouped by. A field's groups are ordered by its kind of value: text A to Z,
 * numbers highest first (Rating 5 before Rating 4), dates by year, newest first (frame 3).
 */
export type Grouping =
  | { readonly kind: 'subcategory' }
  | { readonly kind: 'field'; readonly key: string; readonly order: 'text' | 'number' | 'year' };

/** The SQL a repository adds to a list to group it. */
export type GroupOrder = {
  /**
   * A common table expression the other parts read the grouping field's id from, and the value
   * of its one placeholder; undefined when the grouping needs no field.
   */
  readonly cte: { readonly sql: string; readonly params: readonly string[] } | undefined;
  /**
   * Columns that sort groups into their order, all ascending, so they can be prepended to a
   * list's own order and compared as row values. They are never NULL, as row values need.
   */
  readonly columns: readonly string[];
  /** One value per group, the same for every item in it; NULL for items without a value. */
  readonly value: string;
};

/** The table the field's id is read from; its name is fixed, so the fragments can refer to it. */
const FIELD_CTE = `list_group(field_id) AS (
  SELECT id FROM fields WHERE entity = 'item' AND key = ? AND removed_at IS NULL)`;

/** An item's stored value of the grouping field, read through its primary key. */
function fieldValue(column: 'value_text' | 'value_num'): string {
  return `(SELECT field_values.${column} FROM field_values
    WHERE field_values.entity = 'item' AND field_values.entity_id = items.id
      AND field_values.field_id = (SELECT field_id FROM list_group))`;
}

/** Groups by subcategory: within each section, in the subcategories' own order, Unsorted last. */
const BY_SUBCATEGORY: GroupOrder = {
  cte: undefined,
  columns: [
    SECTION_RANK,
    'items.subcategory_id IS NULL',
    'coalesce((SELECT position FROM subcategories WHERE id = items.subcategory_id), 0)',
    'coalesce(items.subcategory_id, 0)',
  ],
  value: `items.section || ':' || coalesce(items.subcategory_id, 'unsorted')`,
};

/** A field's group value, and the key that sorts it ascending, for each kind of order. */
function fieldParts(order: 'text' | 'number' | 'year'): { value: string; sortKey: string } {
  switch (order) {
    case 'text': {
      const value = fieldValue('value_text');
      return { value, sortKey: `coalesce(lower(${value}), '')` };
    }
    case 'number': {
      const value = fieldValue('value_num');
      return { value, sortKey: `coalesce(-${value}, 0)` };
    }
    case 'year': {
      const value = `substr(${fieldValue('value_text')}, 1, 4)`;
      return { value, sortKey: `coalesce(-CAST(${value} AS INTEGER), 0)` };
    }
  }
}

/** The SQL that groups a list. Items without a value come last, in a group of their own. */
export function groupOrder(grouping: Grouping): GroupOrder {
  if (grouping.kind === 'subcategory') {
    return BY_SUBCATEGORY;
  }
  const { value, sortKey } = fieldParts(grouping.order);
  return {
    cte: { sql: FIELD_CTE, params: [grouping.key] },
    columns: [`${value} IS NULL`, sortKey],
    value,
  };
}
