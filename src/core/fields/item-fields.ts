// Editing one of an item's own fields from its details panel (R11): the rating, the notes, the
// source address or any field added in Settings. Only the library changes; no file on disk does.
import { findItemById } from '#core/db/repositories/items.js';
import { AppError } from '#core/errors.js';

import { readFieldValues, setFieldValue } from './fields.js';

import type { Db } from '#core/db/connection.js';

/** One field of one item, by the field's key. */
export type ItemFieldTarget = {
  readonly itemId: number;
  readonly key: string;
};

/**
 * Saves one item field as typed; empty text clears it. A value sent back unchanged isn't written
 * again, so a pick-list value whose choice was since taken off the list is kept, as Settings
 * promises. The item's search row is rewritten with the value, so a search finds it at once.
 */
export function saveItemField(db: Db, target: ItemFieldTarget, text: string): void {
  const item = findItemById(db, target.itemId);
  if (item === undefined) {
    throw new AppError('not-found', `No item ${String(target.itemId)}.`);
  }
  const owner = {
    entity: 'item' as const,
    entityId: item.id,
    ...(item.subcategoryId !== undefined && { subcategoryId: item.subcategoryId }),
  };
  const current = readFieldValues(db, owner).find((entry) => entry.field.key === target.key);
  if (current === undefined) {
    throw new AppError(
      'not-found',
      `This item has no field "${target.key}" now. Reload the page to see its fields as they are.`,
    );
  }
  const sent = text.trim();
  if (sent === (current.value === undefined ? '' : String(current.value))) {
    return;
  }
  setFieldValue(db, { ...owner, key: target.key }, sent);
}
