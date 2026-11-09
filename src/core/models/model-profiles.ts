// Editing a model's profile in place (frame 14, R14): its fields, its model tags and its
// portrait, saved together in one transaction, so a refused value leaves the profile as it was.
// Only the library changes; no file on disk does.
import { findItemById } from '#core/db/repositories/items.js';
import {
  findModelById,
  findModelTagNames,
  setModelPortrait,
  tagModel,
  untagModel,
} from '#core/db/repositories/models.js';
import { AppError } from '#core/errors.js';
import { isModelName, readFieldValues, setFieldValue } from '#core/fields/fields.js';

import { requireFreeModelName } from './models.js';

import type { Db } from '#core/db/connection.js';

/** A whole profile as the edit form sends it. */
export type ProfileEdit = {
  /** Values by field key, as typed; a model field left out is cleared, as an emptied box is. */
  readonly values: ReadonlyMap<string, string>;
  /** Every model tag the profile keeps; the others are taken off. */
  readonly tags: readonly string[];
  /** The item chosen as the portrait, any in the archive; undefined keeps the current one. */
  readonly portraitItemId?: number;
};

/**
 * Writes the fields whose values changed. One left as it was isn't written again, so a pick-list
 * value whose choice was since taken off the list is kept, as Settings promises.
 */
function saveFields(db: Db, modelId: number, values: ReadonlyMap<string, string>): void {
  const current = readFieldValues(db, { entity: 'model', entityId: modelId });
  const unknownKey = [...values.keys()].find(
    (key) => !current.some((entry) => entry.field.key === key),
  );
  if (unknownKey !== undefined) {
    throw new AppError(
      'not-found',
      `Models have no field "${unknownKey}" now. Reload the page to see the fields as they are.`,
    );
  }
  for (const { field, value } of current) {
    const sent = (values.get(field.key) ?? '').trim();
    if (sent === (value === undefined ? '' : String(value))) {
      continue;
    }
    const text = isModelName(field) ? requireFreeModelName(db, sent, modelId) : sent;
    setFieldValue(db, { entity: 'model', entityId: modelId, key: field.key }, text);
  }
}

/** Gives the model exactly these tags: new ones are added, ones left out are taken off. */
function saveTags(db: Db, modelId: number, tags: readonly string[]): void {
  const wanted = new Set(tags.map((tag) => tag.trim()).filter((tag) => tag !== ''));
  const current = findModelTagNames(db, modelId);
  for (const tag of current.filter((name) => !wanted.has(name))) {
    untagModel(db, modelId, tag);
  }
  for (const tag of [...wanted].filter((name) => !current.includes(name))) {
    tagModel(db, modelId, tag);
  }
}

/** Sets the portrait to an item in the archive, refusing one that isn't there. */
function savePortrait(db: Db, modelId: number, itemId: number): void {
  if (findItemById(db, itemId) === undefined) {
    throw new AppError('not-found', `No item ${String(itemId)} to use as the portrait.`);
  }
  setModelPortrait(db, modelId, itemId);
}

/**
 * Saves a model's profile from the edit page in one transaction. The model keeps its URL when
 * renamed, so links to the profile keep working; its search rows, and those of the items it
 * appears in, are rewritten with the new values.
 */
export function saveModelProfile(db: Db, modelId: number, edit: ProfileEdit): void {
  if (findModelById(db, modelId) === undefined) {
    throw new AppError('not-found', `No model ${String(modelId)}.`);
  }
  db.transaction(() => {
    saveFields(db, modelId, edit.values);
    saveTags(db, modelId, edit.tags);
    if (edit.portraitItemId !== undefined) {
      savePortrait(db, modelId, edit.portraitItemId);
    }
  })();
}
