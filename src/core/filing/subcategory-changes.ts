// The changes Settings and the item page make to subcategories and filing (R5, R36). Each runs
// in one transaction and files items again by the folder mappings it leaves, so a page drawn
// after it already shows every item where it now belongs.
import {
  fileItemsByHand,
  findSectionsByItemIds,
  refileItemsByMappings,
} from '#core/db/repositories/items.js';
import { findAllRoots } from '#core/db/repositories/roots.js';
import {
  deleteFolderMapping,
  deleteSubcategory,
  findFolderMappingById,
  findFolderMappingByPrefix,
  findSubcategoryById,
  hasScopedFields,
  insertFolderMapping,
  insertSubcategory,
  renameSubcategory,
} from '#core/db/repositories/subcategories.js';
import { AppError } from '#core/errors.js';

import { findRootFolder } from './folder-paths.js';

import type { Db } from '#core/db/connection.js';
import type { Section } from '#core/db/repositories/items.js';
import type { Subcategory } from '#core/db/repositories/subcategories.js';

/** A subcategory to add from Settings, with the folder to map to it if one was typed. */
export type NewSubcategory = {
  readonly section: Section;
  readonly name: string;
  readonly folder: string | undefined;
};

/** Files every root's items again by the mappings as they now are. Items filed by hand stay. */
function refileEveryRoot(db: Db): void {
  for (const root of findAllRoots(db)) {
    refileItemsByMappings(db, root.id);
  }
}

/** Returns a subcategory, or refuses the request if it is gone (another tab removed it). */
function requireSubcategory(db: Db, id: number): Subcategory {
  const subcategory = findSubcategoryById(db, id);
  if (subcategory === undefined) {
    throw new AppError('not-found', `No subcategory ${String(id)}.`);
  }
  return subcategory;
}

/** Maps a typed folder to a subcategory, refusing a folder that is already mapped elsewhere. */
function addMapping(db: Db, subcategoryId: number, typedFolder: string): void {
  const folder = findRootFolder(findAllRoots(db), typedFolder);
  const existing = findFolderMappingByPrefix(db, folder.rootId, folder.relPrefix);
  if (existing?.subcategoryId === subcategoryId) {
    return;
  }
  if (existing !== undefined) {
    const holder = requireSubcategory(db, existing.subcategoryId);
    throw new AppError(
      'invalid-input',
      `${typedFolder.trim()} is already mapped to ${holder.name}. Unmap it there first.`,
    );
  }
  insertFolderMapping(db, { ...folder, subcategoryId });
}

/** Adds a subcategory, maps its folder if one was given, and files the folder's items into it. */
export function addSubcategory(db: Db, subcategory: NewSubcategory): number {
  return db.transaction(() => {
    const id = insertSubcategory(db, subcategory.section, subcategory.name.trim());
    if (subcategory.folder !== undefined && subcategory.folder.trim() !== '') {
      addMapping(db, id, subcategory.folder);
      refileEveryRoot(db);
    }
    return id;
  })();
}

/** Renames a subcategory; its items and mappings stay with it. */
export function renameSubcategoryTo(db: Db, id: number, name: string): void {
  renameSubcategory(db, id, name.trim());
}

/** Maps another folder to a subcategory and files that folder's items into it (R5). */
export function mapFolder(db: Db, subcategoryId: number, typedFolder: string): void {
  db.transaction(() => {
    requireSubcategory(db, subcategoryId);
    addMapping(db, subcategoryId, typedFolder);
    refileEveryRoot(db);
  })();
}

/** Removes a folder mapping; the items it filed go where the other mappings put them, or Unsorted. */
export function unmapFolder(db: Db, mappingId: number): void {
  db.transaction(() => {
    if (findFolderMappingById(db, mappingId) === undefined) {
      throw new AppError('not-found', `No folder mapping ${String(mappingId)}.`);
    }
    deleteFolderMapping(db, mappingId);
    refileEveryRoot(db);
  })();
}

/**
 * Removes a subcategory: its items move to Unsorted, unless another mapping holds them, and no
 * file on disk moves. A subcategory with fields of its own (Magazines) is kept, since removing it
 * would delete those fields' values with it.
 */
export function removeSubcategory(db: Db, id: number): void {
  db.transaction(() => {
    const subcategory = requireSubcategory(db, id);
    if (hasScopedFields(db, id)) {
      throw new AppError(
        'invalid-input',
        `${subcategory.name} has fields of its own, so removing it would lose their values.`,
      );
    }
    deleteSubcategory(db, id);
    refileEveryRoot(db);
  })();
}

/**
 * Files items by hand into a subcategory of their own section, or into Unsorted when none is
 * given, in one transaction. Later scans and mapping changes leave them there (R5). The item
 * page files one; the selection's action panel files many (R10). If any item is of another
 * section, none is filed.
 */
export function fileItems(
  db: Db,
  itemIds: readonly number[],
  subcategoryId: number | undefined,
): void {
  const sections = findSectionsByItemIds(db, itemIds);
  const missing = itemIds.find((itemId) => !sections.has(itemId));
  if (missing !== undefined) {
    throw new AppError('not-found', `No item ${String(missing)}.`);
  }
  if (subcategoryId !== undefined) {
    const subcategory = requireSubcategory(db, subcategoryId);
    const strays = itemIds.filter((itemId) => sections.get(itemId) !== subcategory.section);
    if (strays.length > 0) {
      throw new AppError(
        'invalid-input',
        itemIds.length === 1
          ? 'An item can only be filed in its own section.'
          : `${String(strays.length)} of the ${String(itemIds.length)} selected items are in another section, so they can't go in ${subcategory.name}.`,
      );
    }
  }
  fileItemsByHand(db, itemIds, subcategoryId);
}
