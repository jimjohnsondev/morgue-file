// The field system shared by items and models: adding, renaming, removing and restoring fields,
// and reading and writing their values. Templates show whatever this returns, so a new field
// needs no code (R11, R14).
import {
  deleteFieldsRemovedBefore,
  deleteFieldValue,
  findFieldById,
  findFieldByKey,
  findFieldsByEntity,
  findFieldValuesByEntity,
  insertField,
  swapFieldPositions,
  updateFieldLabel,
  updateFieldOptions,
  updateFieldRemovedAt,
  upsertFieldValue,
} from '#core/db/repositories/fields.js';
import { AppError } from '#core/errors.js';
import { joinWords } from '#core/slug.js';

import { fromStoredValue, toStoredValue } from './field-values.js';

import type { Db } from '#core/db/connection.js';
import type { Field, FieldEntity, FieldType } from '#core/db/repositories/fields.js';
import type { FieldValue } from './field-values.js';

/** How long a removed field can be restored with its values (R38). */
export const RESTORE_DAYS = 30;

const RESTORE_MS = RESTORE_DAYS * 24 * 60 * 60 * 1000;

/** The key of the one field a model can't do without: every profile is titled by it. */
export const MODEL_NAME_KEY = 'name';

/** Search words a field key can't take, or `key:x` would be ambiguous (docs/ARCHITECTURE.md). */
const RESERVED_KEYS: ReadonlySet<string> = new Set([
  'tag',
  'model',
  'collection',
  'in',
  'sub',
  'type',
  'rating',
  'unsorted',
  'group',
]);

/** Which way a field moves in its table. */
export type FieldMove = 'up' | 'down';

/** A field the user is adding in Settings. */
export type FieldDraft = {
  readonly entity: FieldEntity;
  readonly label: string;
  readonly type: FieldType;
  readonly options?: readonly string[];
  readonly scopeSubcategoryId?: number;
};

/** One field of one item or model, with its value if it has one. */
export type FieldWithValue = {
  readonly field: Field;
  readonly value: FieldValue | undefined;
};

/** Which item or model a value belongs to. */
export type FieldOwner = {
  readonly entity: FieldEntity;
  readonly entityId: number;
  /** An item's subcategory, so fields limited to one subcategory show only there. */
  readonly subcategoryId?: number;
};

/** Turns a label into a search key: "Agency link" becomes agency_link. */
export function keyFromLabel(label: string): string {
  return joinWords(label, '_');
}

/** The fields an item or model shows, in order: not removed, and not limited to another place. */
export function listFields(db: Db, owner: Omit<FieldOwner, 'entityId'>): Field[] {
  return findFieldsByEntity(db, owner.entity).filter(
    (field) =>
      field.removedAt === undefined &&
      (field.scopeSubcategoryId === undefined || field.scopeSubcategoryId === owner.subcategoryId),
  );
}

/** Adds a field to every item or every model at once, and returns it. */
export function addField(db: Db, draft: FieldDraft): Field {
  const label = draft.label.trim();
  const key = keyFromLabel(label);
  if (key === '' || RESERVED_KEYS.has(key)) {
    throw new AppError('invalid-input', `"${label}" can't be used as a field name.`);
  }
  const existing = findFieldByKey(db, draft.entity, key);
  if (existing?.removedAt !== undefined) {
    throw new AppError(
      'invalid-input',
      `"${existing.label}" was removed and can still be restored, so it can't be added again yet.`,
    );
  }
  if (existing !== undefined) {
    throw new AppError('invalid-input', `There is already a field called "${label}".`);
  }
  const options = draft.type === 'picklist' ? (draft.options ?? []) : [];
  const id = insertField(db, {
    entity: draft.entity,
    key,
    label,
    type: draft.type,
    options,
    scopeSubcategoryId: draft.scopeSubcategoryId,
  });
  return requireField(db, id);
}

/** Renames a field everywhere it shows. Its search key and values stay as they were. */
export function renameField(db: Db, fieldId: number, label: string): void {
  requireField(db, fieldId);
  if (label.trim() === '') {
    throw new AppError('invalid-input', 'A field needs a name.');
  }
  updateFieldLabel(db, fieldId, label.trim());
}

/** Replaces a pick-list's choices. Values already set keep their text. */
export function setPicklistChoices(db: Db, fieldId: number, choices: readonly string[]): void {
  const field = requireField(db, fieldId);
  if (field.type !== 'picklist') {
    throw new AppError('invalid-input', `${field.label} is not a pick-list.`);
  }
  const cleaned = [...new Set(choices.map((choice) => choice.trim()))].filter(Boolean);
  updateFieldOptions(db, fieldId, cleaned);
}

/**
 * Hides a field everywhere. Its values are kept, so restoring it within 30 days brings them
 * back. A model's name can't be removed, since every profile is titled by it.
 */
export function removeField(db: Db, fieldId: number, now: Date): void {
  const field = requireField(db, fieldId);
  if (isModelName(field)) {
    throw new AppError('invalid-input', 'The Name field can be renamed but not removed.');
  }
  if (field.removedAt === undefined) {
    updateFieldRemovedAt(db, fieldId, now.toISOString());
  }
}

/** Brings back a field removed in the last 30 days, with its old values (R38). */
export function restoreField(db: Db, fieldId: number, now: Date): void {
  const field = requireField(db, fieldId);
  if (field.removedAt === undefined) {
    return;
  }
  if (restoreDeadline(field.removedAt) < now) {
    throw new AppError(
      'invalid-input',
      `${field.label} was removed more than ${String(RESTORE_DAYS)} days ago.`,
    );
  }
  updateFieldRemovedAt(db, fieldId, undefined);
}

/** Whether a field is a model's Name, which stays first and can't be removed. */
export function isModelName(field: Field): boolean {
  return field.entity === 'model' && field.key === MODEL_NAME_KEY;
}

/** The last moment a field removed at this time can be restored. */
export function restoreDeadline(removedAt: string): Date {
  return new Date(Date.parse(removedAt) + RESTORE_MS);
}

/** The fields Settings lists for an entity: shown everywhere, not limited to one subcategory. */
export function listSettingsFields(db: Db, entity: FieldEntity): Field[] {
  return listFields(db, { entity }).filter((field) => field.scopeSubcategoryId === undefined);
}

/** A removed field and the last moment it can be restored. */
export type RestorableField = {
  readonly field: Field;
  readonly restoreUntil: Date;
};

/** The fields removed from an entity that can still be restored, soonest to expire first. */
export function listRestorableFields(db: Db, entity: FieldEntity, now: Date): RestorableField[] {
  return findFieldsByEntity(db, entity)
    .flatMap((field) =>
      field.removedAt === undefined
        ? []
        : [{ field, restoreUntil: restoreDeadline(field.removedAt) }],
    )
    .filter((entry) => entry.restoreUntil >= now)
    .sort((first, second) => first.restoreUntil.getTime() - second.restoreUntil.getTime());
}

/**
 * Moves a field one place up or down its Settings table, swapping it with its neighbour. A
 * model's Name stays first, and a field already at an end stays where it is.
 */
export function moveField(db: Db, fieldId: number, move: FieldMove): void {
  const field = requireField(db, fieldId);
  const fields = listSettingsFields(db, field.entity);
  const index = fields.findIndex((candidate) => candidate.id === fieldId);
  if (index === -1) {
    throw new AppError('invalid-input', `${field.label} isn't listed in Settings.`);
  }
  const neighbour = fields[move === 'up' ? index - 1 : index + 1];
  if (neighbour !== undefined && !isModelName(field) && !isModelName(neighbour)) {
    swapFieldPositions(db, field, neighbour);
  }
}

/**
 * Deletes, with their values, the fields removed more than 30 days ago, as R38 promises. The
 * library runs it each time it opens; until then such a field is neither listed nor restorable.
 */
export function purgeExpiredFields(db: Db, now: Date): number {
  return deleteFieldsRemovedBefore(db, new Date(now.getTime() - RESTORE_MS).toISOString());
}

/** Every field an item or model shows, with its value, in order. */
export function readFieldValues(db: Db, owner: FieldOwner): FieldWithValue[] {
  const stored = new Map(
    findFieldValuesByEntity(db, owner.entity, owner.entityId).map((row) => [row.fieldId, row]),
  );
  return listFields(db, owner).map((field) => {
    const row = stored.get(field.id);
    return { field, value: row === undefined ? undefined : fromStoredValue(field, row) };
  });
}

/**
 * Sets one value by field key, checked against the field's type. Empty text clears it, as an
 * emptied form box should.
 */
export function setFieldValue(
  db: Db,
  owner: FieldOwner & { readonly key: string },
  value: FieldValue,
): void {
  const field = listFields(db, owner).find((candidate) => candidate.key === owner.key);
  if (field === undefined) {
    throw new AppError('not-found', `There is no field "${owner.key}" here.`);
  }
  const target = { entity: owner.entity, entityId: owner.entityId, fieldId: field.id };
  if (typeof value === 'string' && value.trim() === '') {
    deleteFieldValue(db, target);
    return;
  }
  upsertFieldValue(db, target, toStoredValue(field, value));
}

function requireField(db: Db, fieldId: number): Field {
  const field = findFieldById(db, fieldId);
  if (field === undefined) {
    throw new AppError('not-found', `No field ${String(fieldId)}.`);
  }
  return field;
}
