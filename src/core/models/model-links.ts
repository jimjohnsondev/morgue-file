// Linking items to models (R15): the selection's action panel (frame 13) links many photos,
// videos or Library items to a model in one transaction, and the item page links or unlinks one.
// A link lives only in the library; no file on disk changes.
import { findModelNames } from '#core/db/repositories/archive-counts.js';
import { isModelId, linkModelToItems, unlinkModelFromItem } from '#core/db/repositories/models.js';
import { AppError } from '#core/errors.js';
import { selectedItemIds } from '#core/organize/bulk-changes.js';

import { createModel } from './models.js';

import type { Db } from '#core/db/connection.js';
import type { PageRange } from '#core/db/repositories/models.js';
import type { BulkResult, Selection } from '#core/organize/bulk-changes.js';

/** The model a link is for: one already in the list, or a new one made with this name. */
export type ModelChoice = { readonly modelId: number } | { readonly newName: string };

/**
 * Makes the new model a choice names, refusing a blank name or one a model already has: a second
 * "Elena Varga" would make `model:"Elena Varga"` find both.
 */
function newModelId(db: Db, name: string): number {
  const trimmed = name.trim();
  if (trimmed === '') {
    throw new AppError('invalid-input', 'A new model needs a name.');
  }
  const folded = trimmed.toLowerCase();
  if (findModelNames(db).some((model) => model.name.toLowerCase() === folded)) {
    throw new AppError('invalid-input', `There is already a model called ${trimmed}.`);
  }
  return createModel(db, trimmed);
}

/** The id of the model a choice names, making it if it's new, or refusing one that's gone. */
function chosenModelId(db: Db, choice: ModelChoice): number {
  if ('newName' in choice) {
    return newModelId(db, choice.newName);
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

/** Takes one of an item's model links away: the whole-item one, or the one over these pages. */
export function unlinkItemFromModel(
  db: Db,
  link: { readonly itemId: number; readonly modelId: number; readonly pages?: PageRange },
): void {
  if (unlinkModelFromItem(db, link) === 0) {
    throw new AppError('not-found', 'That model is not linked to this item.');
  }
}
