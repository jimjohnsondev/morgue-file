import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findSubcategoryBySlug } from '#core/db/repositories/subcategories.js';
import {
  addField,
  keyFromLabel,
  readFieldValues,
  removeField,
  renameField,
  restoreField,
  setFieldValue,
  setPicklistChoices,
} from '#core/fields/fields.js';
import { createModel } from '#core/models/models.js';

import { addTestItem, makeTempLibrary } from '../support/temp-library.js';

import type { Db } from '#core/db/connection.js';
import type { TempLibrary } from '../support/temp-library.js';

let library: TempLibrary;
let db: Db;

beforeEach(async () => {
  library = await makeTempLibrary();
  db = library.db;
});

afterEach(async () => {
  await library.remove();
});

/** The field labels a model's profile shows, in order. */
function profileLabels(modelId: number): string[] {
  return readFieldValues(db, { entity: 'model', entityId: modelId }).map(
    (entry) => entry.field.label,
  );
}

/** One field's value on a model's profile. */
function profileValue(modelId: number, key: string): unknown {
  const fields = readFieldValues(db, { entity: 'model', entityId: modelId });
  return fields.find((entry) => entry.field.key === key)?.value;
}

describe('R14: model fields are data, so every profile follows a change in settings', () => {
  it('R14: a field added in settings appears on every profile', () => {
    const elena = createModel(db, 'Elena Varga');
    const secondModel = createModel(db, 'Second Model');
    expect(profileLabels(elena)).toEqual(['Name', 'Bio']);

    addField(db, { entity: 'model', label: 'Agency link', type: 'link' });
    expect(profileLabels(elena)).toEqual(['Name', 'Bio', 'Agency link']);
    expect(profileLabels(secondModel)).toEqual(['Name', 'Bio', 'Agency link']);
  });

  it('R14: renaming a field renames it on every profile and keeps its values', () => {
    const elena = createModel(db, 'Elena Varga');
    const field = addField(db, { entity: 'model', label: 'Sessions', type: 'number' });
    setFieldValue(db, { entity: 'model', entityId: elena, key: 'sessions' }, 6);

    renameField(db, field.id, 'Sessions booked');
    expect(profileLabels(elena)).toContain('Sessions booked');
    expect(profileValue(elena, 'sessions')).toBe(6);
  });

  it('R14: removing a field hides it from every profile', () => {
    const elena = createModel(db, 'Elena Varga');
    const secondModel = createModel(db, 'Second Model');
    const field = addField(db, { entity: 'model', label: 'First session', type: 'date' });

    removeField(db, field.id, new Date('2026-11-01T00:00:00Z'));
    expect(profileLabels(elena)).toEqual(['Name', 'Bio']);
    expect(profileLabels(secondModel)).toEqual(['Name', 'Bio']);
  });

  it('R14: fields take every type: text, long text, link, date, number and pick-list', () => {
    const elena = createModel(db, 'Elena Varga');
    addField(db, { entity: 'model', label: 'Agency link', type: 'link' });
    addField(db, { entity: 'model', label: 'First session', type: 'date' });
    addField(db, { entity: 'model', label: 'Sessions', type: 'number' });
    addField(db, {
      entity: 'model',
      label: 'Pose length',
      type: 'picklist',
      options: ['Short', 'Long', 'Both'],
    });
    const owner = { entity: 'model', entityId: elena } as const;
    setFieldValue(db, { ...owner, key: 'bio' }, 'Dancer and life model.');
    setFieldValue(db, { ...owner, key: 'agency_link' }, 'https://example.com/elena-varga');
    setFieldValue(db, { ...owner, key: 'first_session' }, '2024-03-14');
    setFieldValue(db, { ...owner, key: 'sessions' }, '6');
    setFieldValue(db, { ...owner, key: 'pose_length' }, 'Long');

    const values = readFieldValues(db, owner).map((entry) => [entry.field.key, entry.value]);
    expect(Object.fromEntries(values)).toEqual({
      name: 'Elena Varga',
      bio: 'Dancer and life model.',
      agency_link: 'https://example.com/elena-varga',
      first_session: '2024-03-14',
      sessions: 6,
      pose_length: 'Long',
    });
  });
});

describe('field values are checked against their type', () => {
  it('refuses values that do not fit', () => {
    const elena = createModel(db, 'Elena Varga');
    addField(db, { entity: 'model', label: 'Agency link', type: 'link' });
    addField(db, { entity: 'model', label: 'First session', type: 'date' });
    addField(db, { entity: 'model', label: 'Sessions', type: 'number' });
    addField(db, { entity: 'model', label: 'Pose length', type: 'picklist', options: ['Long'] });
    const owner = { entity: 'model', entityId: elena } as const;

    expect(() => {
      setFieldValue(db, { ...owner, key: 'agency_link' }, 'javascript:alert(1)');
    }).toThrow(/web address/);
    expect(() => {
      setFieldValue(db, { ...owner, key: 'first_session' }, '2021-02-30');
    }).toThrow(/YYYY-MM-DD/);
    expect(() => {
      setFieldValue(db, { ...owner, key: 'sessions' }, 'six');
    }).toThrow(/number/);
    expect(() => {
      setFieldValue(db, { ...owner, key: 'pose_length' }, 'Short');
    }).toThrow(/one of: Long/);
    expect(() => {
      setFieldValue(db, { ...owner, key: 'no_such_field' }, 'x');
    }).toThrow(/no field/);
  });

  it('clears a value set to empty text', () => {
    const elena = createModel(db, 'Elena Varga');
    const owner = { entity: 'model', entityId: elena, key: 'bio' } as const;
    setFieldValue(db, owner, 'Dancer.');
    setFieldValue(db, owner, '  ');
    expect(profileValue(elena, 'bio')).toBeUndefined();
  });
});

describe('managing fields', () => {
  it('makes search keys from labels and refuses clashes and search words', () => {
    expect(keyFromLabel('Agency link')).toBe('agency_link');
    expect(keyFromLabel('Première séance')).toBe('premiere_seance');
    expect(keyFromLabel('身長')).toBe('身長');
    addField(db, { entity: 'model', label: 'Height', type: 'text' });
    expect(() => addField(db, { entity: 'model', label: 'height', type: 'text' })).toThrow(
      /already a field/,
    );
    expect(() => addField(db, { entity: 'item', label: 'Tag', type: 'text' })).toThrow(
      /can't be used/,
    );
  });

  it('keeps a model’s Name field from being removed', () => {
    const nameField = readFieldValues(db, { entity: 'model', entityId: createModel(db, 'A') })[0]!;
    expect(() => {
      removeField(db, nameField.field.id, new Date());
    }).toThrow(/Name field/);
  });

  it('restores a removed field with its values within 30 days, and not after', () => {
    const elena = createModel(db, 'Elena Varga');
    const field = addField(db, { entity: 'model', label: 'Sessions', type: 'number' });
    setFieldValue(db, { entity: 'model', entityId: elena, key: 'sessions' }, 6);
    removeField(db, field.id, new Date('2026-10-01T00:00:00Z'));

    expect(() => {
      restoreField(db, field.id, new Date('2026-11-01T00:00:01Z'));
    }).toThrow(/more than 30 days/);
    restoreField(db, field.id, new Date('2026-10-31T00:00:00Z'));
    expect(profileValue(elena, 'sessions')).toBe(6);
  });

  it('shows a field limited to one subcategory only on that subcategory’s items', () => {
    const magazines = findSubcategoryBySlug(db, 'library', 'magazines')!;
    const issue = addTestItem(db, 'Magazines/Life Drawing Quarterly No. 1.pdf', 'pdf');
    const book = addTestItem(db, 'Books/Notes on Gesture.pdf', 'pdf');
    const magazineField = readFieldValues(db, {
      entity: 'item',
      entityId: issue,
      subcategoryId: magazines.id,
    }).find((entry) => entry.field.key === 'magazine_title')!.field;
    setPicklistChoices(db, magazineField.id, ['Life Drawing Quarterly', ' Gouache Monthly ']);

    const issueOwner = { entity: 'item', entityId: issue, subcategoryId: magazines.id } as const;
    setFieldValue(db, { ...issueOwner, key: 'magazine_title' }, 'Gouache Monthly');
    setFieldValue(db, { ...issueOwner, key: 'issue_date' }, '2021-03-01');
    const issueKeys = readFieldValues(db, issueOwner).map((entry) => entry.field.key);
    expect(issueKeys).toEqual(['notes', 'source_url', 'rating', 'magazine_title', 'issue_date']);

    const bookKeys = readFieldValues(db, { entity: 'item', entityId: book }).map(
      (entry) => entry.field.key,
    );
    expect(bookKeys).toEqual(['notes', 'source_url', 'rating']);
    expect(() => {
      setFieldValue(db, { entity: 'item', entityId: book, key: 'issue_date' }, '2021-03-01');
    }).toThrow(/no field/);
  });
});
