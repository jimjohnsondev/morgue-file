// Subcategories within a section (Figure, Books...) and the folder mappings that file items into
// them (R4). Unsorted is an item with no subcategory, not a row here.
import { AppError } from '#core/errors.js';
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

/** The slug for a subcategory name, refusing a name with no letter or digit to make one from. */
function requireSlug(name: string): string {
  const slug = slugify(name);
  if (slug === '') {
    throw new AppError('invalid-input', 'A subcategory needs a name with a letter or digit.');
  }
  return slug;
}

/** Adds a subcategory at the end of its section and returns its id. */
export function insertSubcategory(db: Db, section: Section, name: string): number {
  const slug = requireSlug(name);
  if (findSubcategoryBySlug(db, section, slug) !== undefined) {
    throw new AppError('invalid-input', `There is already a subcategory called "${name}".`);
  }
  const thumbShape: ThumbShape = section === 'library' ? 'cover' : 'square';
  const result = db
    .prepare(
      `INSERT INTO subcategories (section, name, slug, position, thumb_shape)
       VALUES (?, ?, ?,
         (SELECT coalesce(max(position), 0) + 1 FROM subcategories WHERE section = ?), ?)`,
    )
    .run(section, name, slug, section, thumbShape);
  return Number(result.lastInsertRowid);
}

/** A section's subcategories in tab order. */
export function findSubcategoriesBySection(db: Db, section: Section): Subcategory[] {
  const rows = db
    .prepare('SELECT * FROM subcategories WHERE section = ? ORDER BY position, id')
    .all(section) as SubcategoryRow[];
  return rows.map(toSubcategory);
}

/** Every subcategory, section by section (Photos, Video, Library) in tab order: Settings' table. */
export function findAllSubcategories(db: Db): Subcategory[] {
  const rows = db
    .prepare(
      `SELECT * FROM subcategories
       ORDER BY CASE section WHEN 'photos' THEN 1 WHEN 'video' THEN 2 ELSE 3 END, position, id`,
    )
    .all() as SubcategoryRow[];
  return rows.map(toSubcategory);
}

/**
 * Renames a subcategory. Its slug follows the name, so its address reads as it is now called;
 * the id stays, so its items and mappings stay with it.
 */
export function renameSubcategory(db: Db, id: number, name: string): void {
  const subcategory = findSubcategoryById(db, id);
  if (subcategory === undefined) {
    throw new AppError('not-found', `No subcategory ${String(id)}.`);
  }
  const slug = requireSlug(name);
  const sameSlug = findSubcategoryBySlug(db, subcategory.section, slug);
  if (sameSlug !== undefined && sameSlug.id !== id) {
    throw new AppError('invalid-input', `There is already a subcategory called "${name}".`);
  }
  db.prepare('UPDATE subcategories SET name = ?, slug = ? WHERE id = ?').run(name, slug, id);
}

/**
 * Removes a subcategory. Its items wait in Unsorted (the column is ON DELETE SET NULL) and its
 * folder mappings go with it (ON DELETE CASCADE). Items filed into it by hand are no longer held
 * by hand, so a mapping that still covers them can file them again.
 */
export function deleteSubcategory(db: Db, id: number): void {
  db.prepare('UPDATE items SET subcategory_manual = 0 WHERE subcategory_id = ?').run(id);
  db.prepare('DELETE FROM subcategories WHERE id = ?').run(id);
}

/** How many items each subcategory holds, missing ones left out, by subcategory id. */
export function countItemsBySubcategory(db: Db): Map<number, number> {
  const rows = db
    .prepare(
      `SELECT subcategory_id AS id, COUNT(*) AS count FROM items
       WHERE subcategory_id IS NOT NULL AND missing_since IS NULL
       GROUP BY subcategory_id`,
    )
    .all() as { id: number; count: number }[];
  return new Map(rows.map((row) => [row.id, row.count]));
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

/** Returns a subcategory by id, or undefined if there is none. */
export function findSubcategoryById(db: Db, id: number): Subcategory | undefined {
  const row = db.prepare('SELECT * FROM subcategories WHERE id = ?').get(id) as
    SubcategoryRow | undefined;
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

/** A folder whose items file themselves into a subcategory. */
export type FolderMapping = {
  readonly id: number;
  readonly rootId: number;
  /** The folder relative to its root, with forward slashes. */
  readonly relPrefix: string;
  readonly subcategoryId: number;
};

type FolderMappingRow = {
  id: number;
  root_id: number;
  rel_prefix: string;
  subcategory_id: number;
};

/** Every folder mapping, in the order they were made. */
export function findFolderMappings(db: Db): FolderMapping[] {
  const rows = db.prepare('SELECT * FROM folder_mappings ORDER BY id').all() as FolderMappingRow[];
  return rows.map(toFolderMapping);
}

/** Returns the mapping of a folder under a root, ignoring case as Windows does, if there is one. */
export function findFolderMappingByPrefix(
  db: Db,
  rootId: number,
  relPrefix: string,
): FolderMapping | undefined {
  // rel_prefix compares NOCASE.
  const row = db
    .prepare('SELECT * FROM folder_mappings WHERE root_id = ? AND rel_prefix = ?')
    .get(rootId, relPrefix) as FolderMappingRow | undefined;
  return row === undefined ? undefined : toFolderMapping(row);
}

/** Returns a folder mapping by id, or undefined if there is none. */
export function findFolderMappingById(db: Db, id: number): FolderMapping | undefined {
  const row = db.prepare('SELECT * FROM folder_mappings WHERE id = ?').get(id) as
    FolderMappingRow | undefined;
  return row === undefined ? undefined : toFolderMapping(row);
}

function toFolderMapping(row: FolderMappingRow): FolderMapping {
  return {
    id: row.id,
    rootId: row.root_id,
    relPrefix: row.rel_prefix,
    subcategoryId: row.subcategory_id,
  };
}

/** Removes a folder mapping; the items it filed are filed again by the caller. */
export function deleteFolderMapping(db: Db, id: number): void {
  db.prepare('DELETE FROM folder_mappings WHERE id = ?').run(id);
}

/** Says whether any field belongs to a subcategory alone (Magazines' title and issue date). */
export function hasScopedFields(db: Db, subcategoryId: number): boolean {
  return (
    db.prepare('SELECT 1 FROM fields WHERE scope = ? LIMIT 1').get(subcategoryId) !== undefined
  );
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
