// Linking items to models (R15): the selection's action panel (frame 13) links many photos,
// videos or Library items to a model in one transaction, and the item page links or unlinks one,
// in the reader over the pages on show (R17). A link lives only in the library; no file on disk
// changes.
import { findItemById } from '#core/db/repositories/items.js';
import { isModelId, linkModelToItems, unlinkModelFromItem } from '#core/db/repositories/models.js';
import { AppError } from '#core/errors.js';
import { selectedItemIds } from '#core/organize/bulk-changes.js';

import { createModel, requireFreeModelName } from './models.js';

import type { Db } from '#core/db/connection.js';
import type { PageRange } from '#core/db/repositories/models.js';
import type { BulkResult, Selection } from '#core/organize/bulk-changes.js';

/** The model a link is for: one already in the list, or a new one made with this name. */
export type ModelChoice = { readonly modelId: number } | { readonly newName: string };

/** The id of the model a choice names, making it if it's new, or refusing one that's gone. */
function chosenModelId(db: Db, choice: ModelChoice): number {
  if ('newName' in choice) {
    return createModel(db, requireFreeModelName(db, choice.newName));
  }
  if (!isModelId(db, choice.modelId)) {
    throw new AppError('not-found', `No model ${String(choice.modelId)}.`);
  }
  return choice.modelId;
}

/**
 * Links every selected item, whole, to a model in one transaction, so 200 photos are linked in one
 * action (R15). Items already linked to it stay linked once.
 */
export function linkSelectionToModel(
  db: Db,
  selection: Selection,
  choice: ModelChoice,
): BulkResult & { readonly modelId: number } {
  return db.transaction(() => {
    const itemIds = selectedItemIds(db, selection);
    const modelId = chosenModelId(db, choice);
    linkModelToItems(db, modelId, { itemIds });
    return { modelId, itemCount: itemIds.length };
  })();
}

/** Refuses a page range that isn't inside a Library item's pages, from first page to last. */
function requirePagesOf(db: Db, itemId: number, pages: PageRange): void {
  const item = findItemById(db, itemId);
  if (item === undefined) {
    throw new AppError('not-found', `No item ${String(itemId)}.`);
  }
  const [from, to] = pages;
  const pageCount = item.section === 'library' ? item.pageCount : undefined;
  if (pageCount === undefined) {
    throw new AppError('invalid-input', 'Only a book or magazine with pages has page ranges.');
  }
  if (from < 1 || from > to || to > pageCount) {
    throw new AppError('invalid-input', `Pages run from 1 to ${String(pageCount)}, from first.`);
  }
}

/**
 * Links one item to a model from its item page: the whole item, or, in the reader, the pages on
 * show (R17), which the profile's Library strip then opens the item at.
 */
export function linkItemToModel(
  db: Db,
  link: { readonly itemId: number; readonly choice: ModelChoice; readonly pages?: PageRange },
): void {
  const { itemId, pages } = link;
  if (pages === undefined) {
    linkSelectionToModel(db, { itemIds: [itemId] }, link.choice);
    return;
  }
  db.transaction(() => {
    requirePagesOf(db, itemId, pages);
    linkModelToItems(db, chosenModelId(db, link.choice), { itemIds: [itemId], pages });
  })();
}

/** Takes one of an item's model links away: the whole-item one, or the one over these pages. */
export function unlinkItemFromModel(
  db: Db,
  link: { readonly itemId: number; readonly modelId: number; readonly pages?: PageRange },
): void {
  if (unlinkModelFromItem(db, link) === 0) {
    throw new AppError('not-found', 'That model is not linked to this item.');
  }
}
