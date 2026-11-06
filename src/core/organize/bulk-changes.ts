// The changes the selection's action panel (frame 13) and the item page make to tags,
// collections and filing. Each takes the items as the ids ticked on a page or as the query of a
// whole list, and runs in one transaction, so 200 items change in one action (R10). None of them
// touches a file on disk: collections and tags live only in the library (R9).
import {
  addItemsToCollection,
  findCollectionById,
  findCollectionIdByName,
  insertCollection,
  removeItemsFromCollection,
} from '#core/db/repositories/collections.js';
import { findItemIdsByQuery } from '#core/db/repositories/item-lists.js';
import { findSectionsByItemIds } from '#core/db/repositories/items.js';
import { tagItems, untagItems } from '#core/db/repositories/tags.js';
import { AppError } from '#core/errors.js';
import { fileItems } from '#core/filing/subcategory-changes.js';
import { compileQuery } from '#core/query/compile-query.js';
import { parseQuery } from '#core/query/parse-query.js';

import type { Db } from '#core/db/connection.js';

/** The items an action is for: those ticked on a page, or everything a list's query matches. */
export type Selection = { readonly itemIds: readonly number[] } | { readonly query: string };

/** The ids a selection names, refusing an empty one or an id with no item. */
export function selectedItemIds(db: Db, selection: Selection): number[] {
  const itemIds =
    'query' in selection
      ? findItemIdsByQuery(db, compileQuery(parseQuery(selection.query)))
      : [...new Set(selection.itemIds)];
  if (itemIds.length === 0) {
    throw new AppError('invalid-input', 'Nothing is selected.');
  }
  const sections = findSectionsByItemIds(db, itemIds);
  const missing = itemIds.find((itemId) => !sections.has(itemId));
  if (missing !== undefined) {
    throw new AppError('not-found', `No item ${String(missing)}.`);
  }
  return itemIds;
}

/** How many items an action changed, for the panel's "Tagged 31 items" line. */
type BulkResult = { readonly itemCount: number };

/** Adds a tag to every selected item, making the tag if it's new (R10). */
export function tagSelection(db: Db, selection: Selection, tagName: string): BulkResult {
  return db.transaction(() => {
    const itemIds = selectedItemIds(db, selection);
    tagItems(db, itemIds, tagName.trim());
    return { itemCount: itemIds.length };
  })();
}

/** Takes a tag off every selected item that has it; the count is of those that had it. */
export function untagSelection(db: Db, selection: Selection, tagName: string): BulkResult {
  return db.transaction(() => {
    const itemIds = selectedItemIds(db, selection);
    return { itemCount: untagItems(db, itemIds, tagName.trim()) };
  })();
}

/** Returns a collection's id, or refuses the request if it is gone (another tab removed it). */
function requireCollection(db: Db, collectionId: number): number {
  if (findCollectionById(db, collectionId) === undefined) {
    throw new AppError('not-found', `No collection ${String(collectionId)}.`);
  }
  return collectionId;
}

/** Adds every selected item to the end of a collection; ones already in it keep their place. */
export function collectSelection(db: Db, selection: Selection, collectionId: number): BulkResult {
  return db.transaction(() => {
    const itemIds = selectedItemIds(db, selection);
    addItemsToCollection(db, requireCollection(db, collectionId), {
      itemIds,
      addedAt: new Date().toISOString(),
    });
    return { itemCount: itemIds.length };
  })();
}

/** Takes every selected item out of a collection; the count is of those that were in it. */
export function uncollectSelection(db: Db, selection: Selection, collectionId: number): BulkResult {
  return db.transaction(() => {
    const itemIds = selectedItemIds(db, selection);
    return {
      itemCount: removeItemsFromCollection(db, requireCollection(db, collectionId), itemIds),
    };
  })();
}

/**
 * Makes a collection holding the selected items and returns its id. Names are unique ignoring
 * case, since `collection:"Spring model session"` finds a collection by its name.
 */
export function createCollectionWith(
  db: Db,
  selection: Selection,
  name: string,
): BulkResult & { readonly collectionId: number } {
  const trimmed = name.trim();
  if (trimmed === '') {
    throw new AppError('invalid-input', 'A new collection needs a name.');
  }
  return db.transaction(() => {
    if (findCollectionIdByName(db, trimmed) !== undefined) {
      throw new AppError('invalid-input', `There is already a collection called ${trimmed}.`);
    }
    const itemIds = selectedItemIds(db, selection);
    const now = new Date().toISOString();
    const collectionId = insertCollection(db, trimmed, now);
    addItemsToCollection(db, collectionId, { itemIds, addedAt: now });
    return { collectionId, itemCount: itemIds.length };
  })();
}

/** Files every selected item by hand into a subcategory of its section, or into Unsorted. */
export function fileSelection(
  db: Db,
  selection: Selection,
  subcategoryId: number | undefined,
): BulkResult {
  return db.transaction(() => {
    const itemIds = selectedItemIds(db, selection);
    fileItems(db, itemIds, subcategoryId);
    return { itemCount: itemIds.length };
  })();
}
