// Counts shown around every page: the footer counter, Unsorted's tab, and the filter panel's
// subcategory, tag, model and collection lists.
import type { Db } from '../connection.js';
import type { Section } from './items.js';

/** The footer's counter (4,312 images · 186 videos · 74 publications in 38 collections). */
export type ArchiveCounts = {
  readonly images: number;
  readonly videos: number;
  readonly publications: number;
  readonly collections: number;
  /** Items with no subcategory, shown on the Unsorted tab. */
  readonly unsorted: number;
  /** The last time anything was added: a file, a collection, or an item to a collection. */
  readonly lastUpdatedAt: string | undefined;
};

/** A subcategory with how many items it holds, for the filter panel. */
export type SubcategoryCount = {
  readonly name: string;
  readonly slug: string;
  readonly itemCount: number;
};

/** A model by name, for the filter panel's model list. */
export type ModelName = {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
};

/** The archive's totals, read in one statement. */
export function countArchive(db: Db): ArchiveCounts {
  const row = db
    .prepare(
      `SELECT
         (SELECT count(*) FROM items WHERE section = 'photos') AS images,
         (SELECT count(*) FROM items WHERE section = 'video') AS videos,
         (SELECT count(*) FROM items WHERE section = 'library') AS publications,
         (SELECT count(*) FROM collections) AS collections,
         (SELECT count(*) FROM items WHERE subcategory_id IS NULL) AS unsorted,
         max(
           coalesce((SELECT max(added_at) FROM items), ''),
           coalesce((SELECT max(created_at) FROM collections), ''),
           coalesce((SELECT max(added_at) FROM collection_items), '')
         ) AS last_updated_at`,
    )
    .get() as Omit<ArchiveCounts, 'lastUpdatedAt'> & { last_updated_at: string };
  const { last_updated_at: lastUpdatedAt, ...counts } = row;
  return { ...counts, lastUpdatedAt: lastUpdatedAt === '' ? undefined : lastUpdatedAt };
}

/** A section's subcategories in tab order, each with its item count. */
export function findSubcategoryCounts(db: Db, section: Section): SubcategoryCount[] {
  const rows = db
    .prepare(
      `SELECT subcategories.name, subcategories.slug,
         (SELECT count(*) FROM items WHERE items.subcategory_id = subcategories.id) AS item_count
       FROM subcategories WHERE subcategories.section = ?
       ORDER BY subcategories.position, subcategories.id`,
    )
    .all(section) as { name: string; slug: string; item_count: number }[];
  return rows.map((row) => ({ name: row.name, slug: row.slug, itemCount: row.item_count }));
}

/** How many of a section's items have no subcategory yet. */
export function countUnsortedInSection(db: Db, section: Section): number {
  const row = db
    .prepare('SELECT count(*) AS total FROM items WHERE section = ? AND subcategory_id IS NULL')
    .get(section) as { total: number };
  return row.total;
}

/** Every item tag, oldest first, so the list keeps the order tags were made in. */
export function findAllTagNames(db: Db): string[] {
  const rows = db.prepare('SELECT name FROM tags ORDER BY id').all() as { name: string }[];
  return rows.map((row) => row.name);
}

/** Every model's id, slug and Name field, alphabetically. */
export function findModelNames(db: Db): ModelName[] {
  const rows = db
    .prepare(
      `SELECT models.id, models.slug, field_values.value_text AS name FROM models
       JOIN field_values ON field_values.entity = 'model' AND field_values.entity_id = models.id
       WHERE field_values.field_id = (SELECT id FROM fields WHERE entity = 'model' AND key = 'name')
       ORDER BY field_values.value_text COLLATE NOCASE`,
    )
    .all() as ModelName[];
  return rows;
}
