// The full-text search rows of items and models (docs/ARCHITECTURE.md, Search tables). Every
// repository that changes what a row holds rewrites it here, in the same transaction, from the
// source views of migration 003.
import type { Db } from '../connection.js';

/** Rewrites the search rows of these items from what the library now holds about them. */
export function rewriteItemSearch(db: Db, itemIds: readonly number[]): void {
  if (itemIds.length === 0) {
    return;
  }
  const ids = JSON.stringify(itemIds);
  db.transaction(() => {
    db.prepare('DELETE FROM item_search WHERE rowid IN (SELECT value FROM json_each(?))').run(ids);
    db.prepare(
      `INSERT INTO item_search (rowid, name, tags, collections, subcategory, fields, models)
       SELECT * FROM item_search_source WHERE item_id IN (SELECT value FROM json_each(?))`,
    ).run(ids);
  })();
}

/**
 * Rewrites the search rows of these models, and of the items they are in, whose rows hold the
 * models' names.
 */
export function rewriteModelSearch(db: Db, modelIds: readonly number[]): void {
  if (modelIds.length === 0) {
    return;
  }
  const ids = JSON.stringify(modelIds);
  db.transaction(() => {
    db.prepare('DELETE FROM model_search WHERE rowid IN (SELECT value FROM json_each(?))').run(ids);
    db.prepare(
      `INSERT INTO model_search (rowid, fields, tags)
       SELECT * FROM model_search_source WHERE model_id IN (SELECT value FROM json_each(?))`,
    ).run(ids);
    const items = db
      .prepare(
        `SELECT DISTINCT item_id FROM item_models
         WHERE model_id IN (SELECT value FROM json_each(?))`,
      )
      .all(ids) as { item_id: number }[];
    rewriteItemSearch(
      db,
      items.map((row) => row.item_id),
    );
  })();
}

/**
 * Rewrites the search rows of everything holding a value of one field, after the field was
 * removed or restored (R38), since a removed field's values are left out of search.
 */
export function rewriteSearchByField(db: Db, fieldId: number): void {
  // Only text reaches a search row; numbers, and an item's links and dates, never do.
  const rows = db
    .prepare(
      `SELECT field_values.entity, field_values.entity_id FROM field_values
       JOIN fields ON fields.id = field_values.field_id
       WHERE field_values.field_id = ? AND field_values.value_text IS NOT NULL
         AND (fields.entity = 'model' OR fields.type IN ('text', 'longtext', 'picklist'))`,
    )
    .all(fieldId) as { entity: 'item' | 'model'; entity_id: number }[];
  const itemIds = rows.filter((row) => row.entity === 'item').map((row) => row.entity_id);
  const modelIds = rows.filter((row) => row.entity === 'model').map((row) => row.entity_id);
  db.transaction(() => {
    rewriteItemSearch(db, itemIds);
    rewriteModelSearch(db, modelIds);
  })();
}

/** A model whose search row matched: what the line of model links above the results shows. */
export type MatchedModel = {
  readonly slug: string;
  readonly name: string;
};

/**
 * The models whose fields or tags match a full-text expression (built by `textMatch` in
 * #core/query), and none of the excluded ones, by name. At most `limit` of them.
 */
export function findModelsByText(
  db: Db,
  text: { readonly match: string; readonly excluded: readonly string[]; readonly limit: number },
): MatchedModel[] {
  const exclusions = text.excluded.map(
    () => 'AND models.id NOT IN (SELECT rowid FROM model_search WHERE model_search MATCH ?)',
  );
  const rows = db
    .prepare(
      `SELECT models.slug, field_values.value_text AS name FROM model_search
       JOIN models ON models.id = model_search.rowid
       JOIN field_values ON field_values.entity = 'model' AND field_values.entity_id = models.id
         AND field_values.field_id = (SELECT id FROM fields WHERE entity = 'model' AND key = 'name')
       WHERE model_search MATCH ? ${exclusions.join(' ')}
       ORDER BY field_values.value_text COLLATE NOCASE LIMIT ?`,
    )
    .all(text.match, ...text.excluded, text.limit) as { slug: string; name: string }[];
  return rows.map((row) => ({ slug: row.slug, name: row.name }));
}
