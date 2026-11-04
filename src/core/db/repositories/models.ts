// Models: their profile rows, model tags, portraits, and the items they appear in (R14–R17).
// A model's name and other details are field values; see #core/fields.
import { optional } from './sql-values.js';
import { requireTagName } from './tags.js';

import type { Db } from '../connection.js';

/** A page range of a book or magazine, from and to inclusive (R17). */
export type PageRange = readonly [from: number, to: number];

/** A model's row: the URL slug and the photo shown as the portrait. */
export type ModelRow = {
  readonly id: number;
  readonly slug: string;
  readonly portraitItemId: number | undefined;
};

/** Adds a model with a URL slug and returns its id. */
export function insertModel(db: Db, slug: string): number {
  const result = db.prepare('INSERT INTO models (slug) VALUES (?)').run(slug);
  return Number(result.lastInsertRowid);
}

/** Says whether a slug is taken, so a second "Elena Varga" gets a different URL. */
export function isModelSlugTaken(db: Db, slug: string): boolean {
  return db.prepare('SELECT 1 FROM models WHERE slug = ?').get(slug) !== undefined;
}

/** Returns the model at /models/<slug>, or undefined if there is none. */
export function findModelBySlug(db: Db, slug: string): ModelRow | undefined {
  const row = db.prepare('SELECT * FROM models WHERE slug = ?').get(slug) as
    { id: number; slug: string; portrait_item_id: number | null } | undefined;
  return row === undefined
    ? undefined
    : { id: row.id, slug: row.slug, portraitItemId: optional(row.portrait_item_id) };
}

/** Every model id, oldest first, for listing every profile. */
export function findAllModelIds(db: Db): number[] {
  const rows = db.prepare('SELECT id FROM models ORDER BY id').all() as { id: number }[];
  return rows.map((row) => row.id);
}

/** Sets a model's portrait to any item in the archive (R14). */
export function setModelPortrait(db: Db, modelId: number, itemId: number): void {
  db.prepare('UPDATE models SET portrait_item_id = ? WHERE id = ?').run(itemId, modelId);
}

/** Gives a model a tag. Model tags are their own namespace, apart from item tags. */
export function tagModel(db: Db, modelId: number, tagName: string): void {
  requireTagName(tagName);
  db.transaction(() => {
    db.prepare('INSERT INTO model_tags (name) VALUES (?) ON CONFLICT (name) DO NOTHING').run(
      tagName,
    );
    db.prepare(
      `INSERT INTO model_tag_links (model_id, model_tag_id)
       SELECT ?, id FROM model_tags WHERE name = ? ON CONFLICT DO NOTHING`,
    ).run(modelId, tagName);
  })();
}

/** A model's tag names, alphabetically. */
export function findModelTagNames(db: Db, modelId: number): string[] {
  const rows = db
    .prepare(
      `SELECT model_tags.name FROM model_tag_links
       JOIN model_tags ON model_tags.id = model_tag_links.model_tag_id
       WHERE model_tag_links.model_id = ? ORDER BY model_tags.name COLLATE NOCASE`,
    )
    .all(modelId) as { name: string }[];
  return rows.map((row) => row.name);
}

/**
 * Links a model to many items in one transaction (R15), each whole or over a page range (R17).
 * A link that already exists isn't added twice.
 */
export function linkModelToItems(
  db: Db,
  modelId: number,
  link: { readonly itemIds: readonly number[]; readonly pages?: PageRange },
): void {
  const from = link.pages?.[0] ?? null;
  const to = link.pages?.[1] ?? null;
  const linkOne = db.prepare(
    `INSERT INTO item_models (item_id, model_id, page_from, page_to)
     SELECT @itemId, @modelId, @from, @to WHERE NOT EXISTS (
       SELECT 1 FROM item_models WHERE item_id = @itemId AND model_id = @modelId
         AND page_from IS @from AND page_to IS @to)`,
  );
  db.transaction(() => {
    for (const itemId of link.itemIds) {
      linkOne.run({ itemId, modelId, from, to });
    }
  })();
}

/** The ids of the items a model appears in, each once, in id order. */
export function findItemIdsByModel(db: Db, modelId: number): number[] {
  const rows = db
    .prepare('SELECT DISTINCT item_id FROM item_models WHERE model_id = ? ORDER BY item_id')
    .all(modelId) as { item_id: number }[];
  return rows.map((row) => row.item_id);
}

/** A model linked to an item, for the chips on the Item page, with the pages they appear on. */
export type ItemModelLink = {
  readonly slug: string;
  readonly name: string;
  /** Undefined when the model appears in the whole item. */
  readonly pages: PageRange | undefined;
};

/** The models an item is linked to, by name, each link once (R15, R17). */
export function findModelLinksByItem(db: Db, itemId: number): ItemModelLink[] {
  const rows = db
    .prepare(
      `SELECT models.slug, field_values.value_text AS name, item_models.page_from,
         item_models.page_to
       FROM item_models
       JOIN models ON models.id = item_models.model_id
       JOIN field_values ON field_values.entity = 'model' AND field_values.entity_id = models.id
       WHERE item_models.item_id = ?
         AND field_values.field_id = (SELECT id FROM fields WHERE entity = 'model' AND key = 'name')
       ORDER BY field_values.value_text COLLATE NOCASE, item_models.page_from`,
    )
    .all(itemId) as {
    slug: string;
    name: string;
    page_from: number | null;
    page_to: number | null;
  }[];
  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    pages:
      row.page_from === null || row.page_to === null ? undefined : [row.page_from, row.page_to],
  }));
}
