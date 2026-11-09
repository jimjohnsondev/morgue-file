// R11 on the item page's details panel (frames 5, 7, 8): notes, source URL and a 1–5 rating,
// each edited in place, searchable as soon as it is saved, and a field added in Settings shows
// on every item page, with its own form, with no code change.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { findItemIdsByQuery } from '#core/db/repositories/item-lists.js';
import {
  addField,
  readFieldValues,
  setFieldValue,
  setPicklistChoices,
} from '#core/fields/fields.js';
import { compileQuery } from '#core/query/compile-query.js';
import { parseQuery } from '#core/query/parse-query.js';

import { startOrganizeApp } from '../support/organize-app.js';

import type { OrganizeApp } from '../support/organize-app.js';

let organize: OrganizeApp;
let itemCount = 0;

beforeAll(async () => {
  organize = await startOrganizeApp();
});

afterAll(async () => {
  await organize.remove();
});

beforeEach(() => {
  organize.reset();
});

/** A Figure photo no other test has touched, so each starts with its fields empty. */
function freshItem(): number {
  itemCount += 1;
  return organize.figureIds[100 + itemCount]!;
}

/** Posts a field's form as client/api-forms.ts does: the key, and the value unless emptied. */
function saveField(itemId: number, key: string, value?: string) {
  return organize.send('POST', `/api/items/${String(itemId)}/fields`, {
    key,
    ...(value !== undefined && { value }),
  });
}

/** An item's field values by key, as its page shows them. */
function valuesOf(itemId: number): Record<string, string | number | undefined> {
  const values = readFieldValues(organize.db, { entity: 'item', entityId: itemId });
  return Object.fromEntries(values.map((entry) => [entry.field.key, entry.value]));
}

/** The ids a search finds, as the Index page would list them. */
function searchIds(query: string): number[] {
  return findItemIdsByQuery(organize.db, compileQuery(parseQuery(query)));
}

/** An item page's HTML. */
async function itemPage(itemId: number): Promise<string> {
  const response = await organize.get(`/item/${String(itemId)}`);
  expect(response.statusCode).toBe(200);
  return response.body;
}

describe('R11: item fields: notes, source URL and a 1–5 rating, in the field system', () => {
  it('R11: the details panel draws each item field with its own form, by type', async () => {
    const itemId = freshItem();
    setFieldValue(organize.db, { entity: 'item', entityId: itemId, key: 'rating' }, 4);
    const html = await itemPage(itemId);
    expect(html).toContain('<span class="rating" aria-label="4 of 5">★★★★☆</span>');
    expect(html).toContain('data-edit-open="field-form-rating" aria-label="Change Rating"');
    expect(html).toMatch(/<select id="field-rating" name="value" class="field">/);
    expect(html).toContain('<option value="4" selected>4 ★★★★☆</option>');
    expect(html).toContain('data-edit-open="field-form-source_url"');
    expect(html).toContain('id="field-source_url" type="url" name="value"');
    expect(html).toContain(`data-api-form="/api/items/${String(itemId)}/fields"`);
    // The notes box is open from the start and saves itself in place, with no Save button.
    expect(html).toMatch(/<form id="field-form-notes" class="inline-form"[^>]* data-api-stay /);
    expect(html).toMatch(/<textarea id="field-notes" name="value"[^>]*data-save-on-change/);
    expect(html).not.toMatch(/<textarea[^>]*disabled/);
  });

  it('R11: notes and the source URL are saved, and a search finds the notes at once', async () => {
    const itemId = freshItem();
    expect((await saveField(itemId, 'notes', 'Gouache study, cool shadows.')).statusCode).toBe(204);
    expect(
      (await saveField(itemId, 'source_url', 'https://example.com/seated-backlit')).statusCode,
    ).toBe(204);
    expect(valuesOf(itemId)).toMatchObject({
      notes: 'Gouache study, cool shadows.',
      source_url: 'https://example.com/seated-backlit',
    });
    expect(searchIds('gouache')).toEqual([itemId]);
    expect(searchIds('source_url:example.com/seated')).toEqual([itemId]);
    const html = await itemPage(itemId);
    expect(html).toContain('>Gouache study, cool shadows.</textarea>');
    expect(html).toContain('<a href="https://example.com/seated-backlit">');
  });

  it('R11: an emptied box clears its field, and the search stops finding it', async () => {
    const itemId = freshItem();
    await saveField(itemId, 'notes', 'Ultramarine wash.');
    expect(searchIds('ultramarine')).toEqual([itemId]);
    expect((await saveField(itemId, 'notes')).statusCode).toBe(204);
    expect(valuesOf(itemId).notes).toBeUndefined();
    expect(searchIds('ultramarine')).toEqual([]);
  });

  it('R11: a rating is a whole number of stars from 1 to 5, and rating:n finds it', async () => {
    const itemId = freshItem();
    expect((await saveField(itemId, 'rating', '5')).statusCode).toBe(204);
    expect(valuesOf(itemId).rating).toBe(5);
    expect(searchIds('rating:5')).toContain(itemId);
    for (const refused of ['0', '6', '3.5', 'lots']) {
      const response = await saveField(itemId, 'rating', refused);
      expect(response.statusCode).toBe(400);
      expect(response.json<{ message: string }>().message).toContain('Rating must');
    }
    expect(valuesOf(itemId).rating).toBe(5);
    expect((await saveField(itemId, 'rating')).statusCode).toBe(204);
    expect(valuesOf(itemId).rating).toBeUndefined();
    const html = await itemPage(itemId);
    expect(html).toContain('<span data-edit-view="field-form-rating">none [');
    expect(html).not.toMatch(/<option value="\d" selected>\d ★/);
  });

  it('R11: a link that is not a web address is refused, and the field keeps its value', async () => {
    const itemId = freshItem();
    await saveField(itemId, 'source_url', 'https://example.com/a');
    const response = await saveField(itemId, 'source_url', 'javascript:alert(1)');
    expect(response.statusCode).toBe(400);
    expect(valuesOf(itemId).source_url).toBe('https://example.com/a');
  });

  it('R11: a new field appears on every item page with no code change, saved and searchable', async () => {
    addField(organize.db, { entity: 'item', label: 'Lighting', type: 'text' });
    const [first, second] = [freshItem(), freshItem()];
    for (const itemId of [first, second]) {
      const html = await itemPage(itemId);
      expect(html).toContain('<th scope="row">Lighting</th>');
      expect(html).toContain('data-edit-open="field-form-lighting" aria-label="Change Lighting"');
      expect(html).toContain('<input id="field-lighting" name="value"');
    }
    expect((await saveField(first, 'lighting', 'north window')).statusCode).toBe(204);
    expect(searchIds('lighting:north')).toEqual([first]);
    expect(searchIds('north window')).toEqual([first]);
  });

  it('R11: a pick-list value taken off its list is kept when its form is saved unchanged', async () => {
    const field = addField(organize.db, {
      entity: 'item',
      label: 'Medium',
      type: 'picklist',
      options: ['Graphite', 'Charcoal'],
    });
    const itemId = freshItem();
    await saveField(itemId, 'medium', 'Charcoal');
    setPicklistChoices(organize.db, field.id, ['Graphite', 'Gouache']);
    expect(await itemPage(itemId)).toContain('<option value="Charcoal" selected>Charcoal</option>');
    expect((await saveField(itemId, 'medium', 'Charcoal')).statusCode).toBe(204);
    expect(valuesOf(itemId).medium).toBe('Charcoal');
    expect((await saveField(itemId, 'medium', 'Charcoal stick')).statusCode).toBe(400);
  });

  it('R11: a field that items do not have, or an item that is not there, is refused', async () => {
    expect((await saveField(freshItem(), 'agency_link', 'https://example.com')).statusCode).toBe(
      404,
    );
    expect((await saveField(999_999, 'notes', 'Anything')).statusCode).toBe(404);
    const noKey = await organize.send('POST', `/api/items/${String(freshItem())}/fields`, {
      value: 'x',
    });
    expect(noKey.statusCode).toBe(400);
  });
});
