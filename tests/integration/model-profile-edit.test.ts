// R14 on the profile editor (frame 14): one row per field, drawn by its type, the model tags and a
// portrait chooser, all saved in one request. A refused value leaves the profile as it was, a
// field added in Settings shows with no code change, and the portrait can be any photo.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { findItemIdsByQuery } from '#core/db/repositories/item-lists.js';
import {
  findModelById,
  findModelTagNames,
  linkModelToItems,
  setModelPortrait,
  tagModel,
} from '#core/db/repositories/models.js';
import { findModelsByText } from '#core/db/repositories/search-rows.js';
import {
  addField,
  readFieldValues,
  setFieldValue,
  setPicklistChoices,
} from '#core/fields/fields.js';
import { createModel } from '#core/models/models.js';
import { compileQuery } from '#core/query/compile-query.js';
import { parseQuery } from '#core/query/parse-query.js';

import { startOrganizeApp } from '../support/organize-app.js';

import type { OrganizeApp } from '../support/organize-app.js';

let organize: OrganizeApp;
let modelCount = 0;
let poseLengthId: number;

beforeAll(async () => {
  organize = await startOrganizeApp();
  // The design brief's demo fields, so the editor has one of each of the six types.
  addField(organize.db, { entity: 'model', label: 'Agency link', type: 'link' });
  addField(organize.db, { entity: 'model', label: 'First session', type: 'date' });
  addField(organize.db, { entity: 'model', label: 'Sessions', type: 'number' });
  poseLengthId = addField(organize.db, {
    entity: 'model',
    label: 'Pose length',
    type: 'picklist',
    options: ['Short', 'Long', 'Both'],
  }).id;
});

afterAll(async () => {
  await organize.remove();
});

beforeEach(() => {
  organize.reset();
});

type TestModel = { readonly id: number; readonly slug: string; readonly name: string };

/** A new model, named apart from the others, linked to the first ten Figure photos. */
function makeModel(): TestModel {
  modelCount += 1;
  const name = `Elena Varga ${String(modelCount)}`;
  const id = createModel(organize.db, name);
  setFieldValue(organize.db, { entity: 'model', entityId: id, key: 'bio' }, 'Dancer.');
  linkModelToItems(organize.db, id, { itemIds: organize.figureIds.slice(0, 10) });
  return { id, slug: findModelById(organize.db, id)!.slug, name };
}

/** A model's field values by key, as its profile shows them. */
function valuesOf(modelId: number): Record<string, string | number | undefined> {
  const values = readFieldValues(organize.db, { entity: 'model', entityId: modelId });
  return Object.fromEntries(values.map((entry) => [entry.field.key, entry.value]));
}

/** Posts the edit form as client/api-forms.ts does: each box by name, empty ones left out. */
function saveProfile(model: TestModel, fields: Record<string, string>) {
  return organize.send('POST', `/api/models/${String(model.id)}/profile`, fields);
}

/** The ids a search finds, as the Index page would list them. */
function searchIds(query: string): number[] {
  return findItemIdsByQuery(organize.db, compileQuery(parseQuery(query)));
}

describe('R14: model profiles with user-defined fields, model tags and a portrait', () => {
  it('R14: the profile editor has one row per field, drawn by its type, with the tags and photos', async () => {
    const model = makeModel();
    tagModel(organize.db, model.id, 'dancer');
    setModelPortrait(organize.db, model.id, organize.figureIds[2]!);
    const response = await organize.get(`/models/${model.slug}/edit`);
    expect(response.statusCode).toBe(200);
    const html = response.body;
    expect(html).toContain(`<h1 class="page__title">Edit ${model.name}</h1>`);
    expect(html).toMatch(
      /<input id="field-name" name="field\.name" class="field[^"]*" value="Elena/,
    );
    expect(html).toMatch(/<textarea id="field-bio" name="field\.bio"[^>]*>Dancer\.<\/textarea>/);
    expect(html).toContain('id="field-agency_link" type="url"');
    expect(html).toContain('id="field-first_session" type="date"');
    expect(html).toContain('id="field-sessions" type="number"');
    expect(html).toMatch(/<select id="field-pose_length" name="field\.pose_length"/);
    for (const typeName of ['short text', 'long text', 'link', 'date', 'number', 'pick-list']) {
      expect(html).toContain(`<td class="profile-edit__type">${typeName}</td>`);
    }
    expect(html).toContain('data-tag-chip="dancer"');
    expect(html).toMatch(/<input type="hidden" name="tags" value="dancer" data-tag-list/);
    // The model's first eight photos, the portrait among them and chosen.
    expect(html.match(/name="portrait"/g)).toHaveLength(8);
    expect(html).toContain(`value="${String(organize.figureIds[2])}" checked`);
    expect(html).toContain("more of Elena's 10 photos »");
    expect(html).toContain('data-api-next="/models/' + model.slug + '"');
  });

  it('R14: Save profile writes every field, the tags and the portrait in one request', async () => {
    const model = makeModel();
    tagModel(organize.db, model.id, 'dancer');
    tagModel(organize.db, model.id, 'long poses');
    const response = await saveProfile(model, {
      'field.name': 'Elena Vargas',
      'field.bio': 'Dancer and life model.',
      'field.agency_link': 'https://example.com/elena-varga',
      'field.first_session': '2024-03-14',
      'field.sessions': '6',
      'field.pose_length': 'Long',
      tags: 'dancer\nback-lit\n',
      portrait: String(organize.figureIds[4]),
    });
    expect(response.statusCode, response.body).toBe(204);
    expect(valuesOf(model.id)).toEqual({
      name: 'Elena Vargas',
      bio: 'Dancer and life model.',
      agency_link: 'https://example.com/elena-varga',
      first_session: '2024-03-14',
      sessions: 6,
      pose_length: 'Long',
    });
    expect(findModelTagNames(organize.db, model.id)).toEqual(['back-lit', 'dancer']);
    expect(findModelById(organize.db, model.id)?.portraitItemId).toBe(organize.figureIds[4]);
    // The URL stays, and search finds the model and its photos by the new name at once.
    const profile = await organize.get(`/models/${model.slug}`);
    expect(profile.body).toContain('<h1 class="page__title">Elena Vargas</h1>');
    expect(searchIds('model:"Elena Vargas"')).toHaveLength(10);
    const found = findModelsByText(organize.db, { match: '"back-lit"', excluded: [], limit: 10 });
    expect(found.map((match) => match.slug)).toContain(model.slug);
  });

  it('R14: a box left empty clears its field, and the name stays required', async () => {
    const model = makeModel();
    const cleared = await saveProfile(model, { 'field.name': model.name });
    expect(cleared.statusCode, cleared.body).toBe(204);
    expect(valuesOf(model.id).bio).toBeUndefined();

    const blank = await saveProfile(model, { 'field.bio': 'Back again.' });
    expect(blank.statusCode).toBe(400);
    expect(blank.json<{ message: string }>().message).toBe('A model needs a name.');
    expect(valuesOf(model.id)).toMatchObject({ name: model.name, bio: undefined });
  });

  it('R14: a refused value leaves the whole profile as it was', async () => {
    const model = makeModel();
    tagModel(organize.db, model.id, 'dancer');
    const other = makeModel();
    const takenName = await saveProfile(model, { 'field.name': other.name.toUpperCase() });
    expect(takenName.json<{ message: string }>().message).toBe(
      `There is already a model called ${other.name.toUpperCase()}.`,
    );
    const badLink = await saveProfile(model, {
      'field.name': model.name,
      'field.bio': 'Changed.',
      'field.agency_link': 'javascript:alert(1)',
      tags: 'changed',
    });
    expect(badLink.statusCode).toBe(400);
    expect(badLink.json<{ message: string }>().message).toBe(
      'Agency link must be a web address starting with http:// or https://.',
    );
    expect(valuesOf(model.id)).toMatchObject({ name: model.name, bio: 'Dancer.' });
    expect(findModelTagNames(organize.db, model.id)).toEqual(['dancer']);
  });

  it('R14: the portrait can be any photo in the archive, and shows first in the chooser', async () => {
    const model = makeModel();
    const unlinkedPhoto = organize.figureIds[200]!;
    const saved = await saveProfile(model, {
      'field.name': model.name,
      portrait: String(unlinkedPhoto),
    });
    expect(saved.statusCode, saved.body).toBe(204);
    const editor = await organize.get(`/models/${model.slug}/edit`);
    const radios = [...editor.body.matchAll(/name="portrait" value="(\d+)"/g)].map((match) =>
      Number(match[1]),
    );
    expect(radios).toEqual([unlinkedPhoto, ...organize.figureIds.slice(0, 7)]);
    const profile = await organize.get(`/models/${model.slug}`);
    expect(profile.body).toContain(`/media/thumb/${String(unlinkedPhoto)}/`);

    const missing = await saveProfile(model, { 'field.name': model.name, portrait: '999999' });
    expect(missing.statusCode).toBe(404);
  });

  it("R14: a Library item can't be the portrait, only a photo", async () => {
    const model = makeModel();
    const book = await saveProfile(model, {
      'field.name': model.name,
      portrait: String(organize.bookId),
    });
    expect(book.statusCode).toBe(400);
    expect(book.json<{ message: string }>().message).toBe('The portrait must be a photo.');
    expect(findModelById(organize.db, model.id)?.portraitItemId).toBeUndefined();
  });

  it('R14: a field added in Settings shows on every profile editor with no code change', async () => {
    const model = makeModel();
    const added = await organize.send('POST', '/api/fields', {
      entity: 'model',
      label: 'Height',
      type: 'text',
    });
    expect(added.statusCode, added.body).toBe(200);
    const editor = await organize.get(`/models/${model.slug}/edit`);
    expect(editor.body).toContain('<label for="field-height">Height</label>');
    const saved = await saveProfile(model, { 'field.name': model.name, 'field.height': '170 cm' });
    expect(saved.statusCode, saved.body).toBe(204);
    expect(valuesOf(model.id).height).toBe('170 cm');
  });

  it('R14: a pick-list value whose choice was taken off the list is kept when saved again', async () => {
    const model = makeModel();
    const owner = { entity: 'model', entityId: model.id, key: 'pose_length' } as const;
    setFieldValue(organize.db, owner, 'Both');
    setPicklistChoices(organize.db, poseLengthId, ['Short', 'Long']);
    try {
      const editor = await organize.get(`/models/${model.slug}/edit`);
      expect(editor.body).toContain('<option value="Both" selected>Both</option>');
      const saved = await saveProfile(model, {
        'field.name': model.name,
        'field.pose_length': 'Both',
      });
      expect(saved.statusCode, saved.body).toBe(204);
      expect(valuesOf(model.id).pose_length).toBe('Both');
    } finally {
      setPicklistChoices(organize.db, poseLengthId, ['Short', 'Long', 'Both']);
    }
  });

  it('R14: the editor refuses a missing model and a field models lack, and drops other boxes', async () => {
    const model = makeModel();
    expect((await organize.get('/models/nobody/edit')).statusCode).toBe(404);
    const gone = { id: 999_999, slug: 'gone', name: 'Gone' };
    expect((await saveProfile(gone, { 'field.name': 'Gone' })).statusCode).toBe(404);
    const unknownField = await saveProfile(model, { 'field.name': model.name, 'field.age': '30' });
    expect(unknownField.statusCode).toBe(400);
    // Fastify drops properties a schema doesn't name, as it does on every route.
    const unknownBox = await saveProfile(model, { 'field.name': model.name, colour: 'red' });
    expect(unknownBox.statusCode).toBe(204);
  });

  it('R14: the profile links to its editor, its portrait chooser and its tags', async () => {
    const model = makeModel();
    const profile = await organize.get(`/models/${model.slug}`);
    const editHref = `/models/${model.slug}/edit`;
    expect(profile.body).toContain(`<a href="${editHref}">edit profile</a>`);
    expect(profile.body).toContain('<a href="/settings#fields">edit fields for all models</a>');
    expect(profile.body).toContain(`<a href="${editHref}#portrait">choose</a>`);
    expect(profile.body).toContain(`<a href="${editHref}#model-tags">add tag</a>`);
    expect(profile.body).not.toContain('disabled');
  });
});
