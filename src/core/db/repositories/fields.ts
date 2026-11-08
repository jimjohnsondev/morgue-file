// The field definitions and values shared by items and models (docs/ARCHITECTURE.md, Field
// system). Rules about what a value may be live in #core/fields; this file only stores them.
import { rewriteItemSearch, rewriteModelSearch, rewriteSearchByField } from './search-rows.js';
import { optional } from './sql-values.js';

import type { Db } from '../connection.js';

/** What a field belongs to. */
export type FieldEntity = 'item' | 'model';

/** The kinds of value a field can hold (R14). */
export type FieldType = 'text' | 'longtext' | 'link' | 'date' | 'number' | 'picklist';

/** A field definition. Templates render whatever these rows say, so no field needs code. */
export type Field = {
  readonly id: number;
  readonly entity: FieldEntity;
  /** The name used in search (`agency:example.com`); it never changes after the field is made. */
  readonly key: string;
  readonly label: string;
  readonly type: FieldType;
  /** The choices of a pick-list; empty for other types. */
  readonly options: readonly string[];
  /** The one subcategory whose items show the field (Magazines' issue date), if limited to one. */
  readonly scopeSubcategoryId: number | undefined;
  readonly position: number;
  readonly isBuiltin: boolean;
  /** When the field was removed; its values are kept for 30 days in case it's restored (R38). */
  readonly removedAt: string | undefined;
};

/** A field before it has an id. */
export type NewField = Omit<Field, 'id' | 'position' | 'isBuiltin' | 'removedAt'>;

/** A value as stored: dates and text in valueText, numbers and ratings in valueNum. */
export type StoredValue = {
  readonly valueText: string | undefined;
  readonly valueNum: number | undefined;
};

/** One stored value of one item or model. */
export type FieldValueRow = StoredValue & { readonly fieldId: number };

type FieldRow = {
  id: number;
  entity: FieldEntity;
  key: string;
  label: string;
  type: FieldType;
  options: string;
  scope: number | null;
  position: number;
  builtin: 0 | 1;
  removed_at: string | null;
};

/** Every field of an entity, removed ones included, in display order. */
export function findFieldsByEntity(db: Db, entity: FieldEntity): Field[] {
  const rows = db
    .prepare('SELECT * FROM fields WHERE entity = ? ORDER BY position, id')
    .all(entity) as FieldRow[];
  return rows.map(toField);
}

/** Returns a field by id, or undefined if there is none. */
export function findFieldById(db: Db, id: number): Field | undefined {
  const row = db.prepare('SELECT * FROM fields WHERE id = ?').get(id) as FieldRow | undefined;
  return row === undefined ? undefined : toField(row);
}

/** Returns an entity's field by key, removed or not, or undefined if there is none. */
export function findFieldByKey(db: Db, entity: FieldEntity, key: string): Field | undefined {
  const row = db.prepare('SELECT * FROM fields WHERE entity = ? AND key = ?').get(entity, key) as
    FieldRow | undefined;
  return row === undefined ? undefined : toField(row);
}

/** Adds a field after the entity's last one and returns its id. */
export function insertField(db: Db, field: NewField): number {
  const result = db
    .prepare(
      `INSERT INTO fields (entity, key, label, type, options, scope, position)
       VALUES (?, ?, ?, ?, ?, ?,
         (SELECT coalesce(max(position), 0) + 1 FROM fields WHERE entity = ?))`,
    )
    .run(
      field.entity,
      field.key,
      field.label,
      field.type,
      JSON.stringify(field.options),
      field.scopeSubcategoryId ?? null,
      field.entity,
    );
  return Number(result.lastInsertRowid);
}

/** Changes the label people see. The key stays, so saved searches keep working. */
export function updateFieldLabel(db: Db, id: number, label: string): void {
  db.prepare('UPDATE fields SET label = ? WHERE id = ?').run(label, id);
}

/** Replaces a pick-list's choices. */
export function updateFieldOptions(db: Db, id: number, options: readonly string[]): void {
  db.prepare('UPDATE fields SET options = ? WHERE id = ?').run(JSON.stringify(options), id);
}

/** Swaps the display order of two fields. */
export function swapFieldPositions(db: Db, first: Field, second: Field): void {
  const setPosition = db.prepare('UPDATE fields SET position = ? WHERE id = ?');
  db.transaction(() => {
    setPosition.run(second.position, first.id);
    setPosition.run(first.position, second.id);
  })();
}

/**
 * Deletes the fields removed before a time, with their values (the foreign key cascades). Their
 * values were already left out of every search row when they were removed, so none changes.
 */
export function deleteFieldsRemovedBefore(db: Db, cutoff: string): number {
  return db.prepare('DELETE FROM fields WHERE removed_at < ?').run(cutoff).changes;
}

/** Marks a field removed at a time, or restores it with undefined. Its values are untouched. */
export function updateFieldRemovedAt(db: Db, id: number, removedAt: string | undefined): void {
  db.transaction(() => {
    db.prepare('UPDATE fields SET removed_at = ? WHERE id = ?').run(removedAt ?? null, id);
    rewriteSearchByField(db, id);
  })();
}

/** Rewrites the search row of the item or model whose field value changed. */
function rewriteSearchOf(
  db: Db,
  target: { readonly entity: FieldEntity; readonly entityId: number },
) {
  if (target.entity === 'item') {
    rewriteItemSearch(db, [target.entityId]);
  } else {
    rewriteModelSearch(db, [target.entityId]);
  }
}

/** Sets one value of one item or model, replacing any value it had. */
export function upsertFieldValue(
  db: Db,
  target: { readonly entity: FieldEntity; readonly entityId: number; readonly fieldId: number },
  value: StoredValue,
): void {
  const upsert = db.prepare(
    `INSERT INTO field_values (entity, entity_id, field_id, value_text, value_num)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (entity, entity_id, field_id)
       DO UPDATE SET value_text = excluded.value_text, value_num = excluded.value_num`,
  );
  db.transaction(() => {
    upsert.run(
      target.entity,
      target.entityId,
      target.fieldId,
      value.valueText ?? null,
      value.valueNum ?? null,
    );
    rewriteSearchOf(db, target);
  })();
}

/** Clears one value of one item or model. */
export function deleteFieldValue(
  db: Db,
  target: { readonly entity: FieldEntity; readonly entityId: number; readonly fieldId: number },
): void {
  db.transaction(() => {
    db.prepare('DELETE FROM field_values WHERE entity = ? AND entity_id = ? AND field_id = ?').run(
      target.entity,
      target.entityId,
      target.fieldId,
    );
    rewriteSearchOf(db, target);
  })();
}

/** Every stored value of one item or model, removed fields' values included. */
export function findFieldValuesByEntity(
  db: Db,
  entity: FieldEntity,
  entityId: number,
): FieldValueRow[] {
  const rows = db
    .prepare(
      `SELECT field_id, value_text, value_num FROM field_values
       WHERE entity = ? AND entity_id = ?`,
    )
    .all(entity, entityId) as {
    field_id: number;
    value_text: string | null;
    value_num: number | null;
  }[];
  return rows.map((row) => ({
    fieldId: row.field_id,
    valueText: optional(row.value_text),
    valueNum: optional(row.value_num),
  }));
}

function toField(row: FieldRow): Field {
  return {
    id: row.id,
    entity: row.entity,
    key: row.key,
    label: row.label,
    type: row.type,
    options: JSON.parse(row.options) as string[],
    scopeSubcategoryId: optional(row.scope),
    position: row.position,
    isBuiltin: row.builtin === 1,
    removedAt: optional(row.removed_at),
  };
}
