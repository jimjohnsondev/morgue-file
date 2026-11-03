// Subcategories within a section (Figure, Books...) and the folder mappings that file items into
// them (R4). Unsorted is an item with no subcategory, not a row here.
import { slugify } from '#core/slug.js';

import { optional } from './sql-values.js';

import type { Db } from '../connection.js';
import type { Section } from './items.js';

/** How an Index page shows a subcategory's thumbnails: square photos or tall Library covers. */
export type ThumbShape = 'square' | 'cover';

/** A subcategory, as listed in its section's tab. */
export type Subcategory = {
  readonly id: number;
  readonly section: Section;
  readonly name: string;
  /** The URL segment: /photos/<slug>. */
  readonly slug: string;
  readonly position: number;
  readonly thumbShape: ThumbShape;
  /** How its Index page groups items, as JSON (Magazines groups by title), if it does. */
  readonly groupBy: string | undefined;
};

type SubcategoryRow = {
  id: number;
  section: Section;
  name: string;
  slug: string;
  position: number;
  thumb_shape: ThumbShape;
  group_by: string | null;
};

/** Adds a subcategory at the end of its section and returns its id. */
export function insertSubcategory(db: Db, section: Section, name: string): number {
  const thumbShape: ThumbShape = section === 'library' ? 'cover' : 'square';
  const result = db
    .prepare(
      `INSERT INTO subcategories (section, name, slug, position, thumb_shape)
       VALUES (?, ?, ?,
         (SELECT coalesce(max(position), 0) + 1 FROM subcategories WHERE section = ?), ?)`,
    )
    .run(section, name, slugify(name), section, thumbShape);
  return Number(result.lastInsertRowid);
}

/** A section's subcategories in tab order. */
export function findSubcategoriesBySection(db: Db, section: Section): Subcategory[] {
  const rows = db
    .prepare('SELECT * FROM subcategories WHERE section = ? ORDER BY position, id')
    .all(section) as SubcategoryRow[];
  return rows.map(toSubcategory);
}

/** Returns the subcategory at /<section>/<slug>, or undefined if there is none. */
export function findSubcategoryBySlug(
  db: Db,
  section: Section,
  slug: string,
): Subcategory | undefined {
  const row = db
    .prepare('SELECT * FROM subcategories WHERE section = ? AND slug = ?')
    .get(section, slug) as SubcategoryRow | undefined;
  return row === undefined ? undefined : toSubcategory(row);
}

/**
 * Maps a folder under a root to a subcategory, so new files in it file themselves. The prefix is
 * a relative folder path with forward slashes and no trailing slash.
 */
export function insertFolderMapping(
  db: Db,
  mapping: { readonly rootId: number; readonly relPrefix: string; readonly subcategoryId: number },
): number {
  const result = db
    .prepare('INSERT INTO folder_mappings (root_id, rel_prefix, subcategory_id) VALUES (?, ?, ?)')
    .run(mapping.rootId, mapping.relPrefix, mapping.subcategoryId);
  return Number(result.lastInsertRowid);
}

function toSubcategory(row: SubcategoryRow): Subcategory {
  return {
    id: row.id,
    section: row.section,
    name: row.name,
    slug: row.slug,
    position: row.position,
    thumbShape: row.thumb_shape,
    groupBy: optional(row.group_by),
  };
}
