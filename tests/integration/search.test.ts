// R24 on a small library behind the real app: free text finds items by file name, tags,
// collections, subcategory, notes and model names; search rows follow every change; and a
// search's words list the models they find by their fields and tags.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { addItemsToCollection, insertCollection } from '#core/db/repositories/collections.js';
import { findFieldByKey } from '#core/db/repositories/fields.js';
import { findItemIdsByQuery } from '#core/db/repositories/item-lists.js';
import { moveItem } from '#core/db/repositories/items.js';
import { linkModelToItems, tagModel } from '#core/db/repositories/models.js';
import { tagItems, untagItems } from '#core/db/repositories/tags.js';
import { removeField, restoreField, setFieldValue } from '#core/fields/fields.js';
import { fileItems, renameSubcategoryTo } from '#core/filing/subcategory-changes.js';
import { createModel } from '#core/models/models.js';
import { compileQuery } from '#core/query/compile-query.js';
import { parseQuery } from '#core/query/parse-query.js';

import { startOrganizeApp } from '../support/organize-app.js';
import { addTestItem } from '../support/temp-library.js';

import type { OrganizeApp } from '../support/organize-app.js';

let organize: OrganizeApp;
let elenaId: number;
let backlitId: number;

/** The ids of the items a query string finds. */
function search(text: string): number[] {
  return findItemIdsByQuery(organize.db, compileQuery(parseQuery(text)));
}

/** The Figure photo numbered n (1 to 250). */
function figure(slot: number): number {
  return organize.figureIds[slot - 1]!;
}

beforeAll(async () => {
  organize = await startOrganizeApp();
  const { db } = organize;
  backlitId = addTestItem(db, 'Inbox/seatedBacklit_017.jpg');
  setFieldValue(db, { entity: 'item', entityId: figure(9), key: 'notes' }, 'Strong rim light.');
  setFieldValue(db, { entity: 'item', entityId: figure(11), key: 'notes' }, 'Étude in red.');
  elenaId = createModel(db, 'Elena Varga');
  setFieldValue(
    db,
    { entity: 'model', entityId: elenaId, key: 'bio' },
    'Dancer and life model. Best in long seated poses.',
  );
  tagModel(db, elenaId, 'long poses');
  linkModelToItems(db, elenaId, { itemIds: [figure(10)] });
});

// The reset empties tags and collections, so they are seeded again after it.
beforeEach(() => {
  organize.reset();
  const { db } = organize;
  tagItems(db, [figure(7)], 'contrapposto');
  addItemsToCollection(db, insertCollection(db, 'Spring model session', '2026-10-31'), {
    itemIds: [figure(8)],
    addedAt: '2026-10-31',
  });
});

afterAll(async () => {
  await organize.remove();
});

describe('R24: free text', () => {
  it('R24: finds items by file name words, tags, collections, subcategory, notes and models', () => {
    expect(search('backlit')).toEqual([backlitId]);
    expect(search('contrapposto')).toEqual([figure(7)]);
    expect(search('spring')).toEqual([figure(8)]);
    expect(search('rim')).toEqual([figure(9)]);
    expect(search('varga')).toEqual([figure(10)]);
    expect(search('books')).toEqual([organize.bookId]);
    expect(search('etude')).toEqual([figure(11)]);
  });

  it('R24: matches the last word as a prefix, phrases exactly, and drops negated words', () => {
    expect(search('contrap')).toEqual([figure(7)]);
    expect(search('contrap figure')).toEqual([]);
    expect(search('figure contrap')).toEqual([figure(7)]);
    expect(search('"rim light"')).toEqual([figure(9)]);
    expect(search('"light rim"')).toEqual([]);
    expect(search('figure -contrapposto')).toHaveLength(249);
    expect(search('in:photos sub:figure figure_000')).toHaveLength(9);
  });
});

describe('R24: search rows follow changes', () => {
  it('R24: follows tags, filing by hand, a renamed subcategory and a moved file', () => {
    const { db } = organize;
    tagItems(db, [figure(20)], 'profile');
    expect(search('profile')).toEqual([figure(20)]);
    untagItems(db, [figure(20)], 'profile');
    expect(search('profile')).toEqual([]);

    fileItems(db, [figure(21)], organize.handsId);
    expect(search('hands')).toEqual([figure(21), organize.bookId]);
    renameSubcategoryTo(db, organize.handsId, 'Gesture');
    expect(search('gesture')).toEqual([figure(21)]);

    moveItem(db, { id: figure(22), relPath: 'Figure/kneeling_022.jpg', size: 1, mtimeMs: 1 });
    expect(search('kneeling')).toEqual([figure(22)]);
    expect(search('figure_0022')).toEqual([]);
  });

  it('R24: follows a renamed model and a removed or restored field', () => {
    const { db } = organize;
    setFieldValue(db, { entity: 'model', entityId: elenaId, key: 'name' }, 'Elena Moreau');
    expect(search('moreau')).toEqual([figure(10)]);
    expect(search('varga')).toEqual([]);

    const notes = findFieldByKey(db, 'item', 'notes')!;
    removeField(db, notes.id, new Date('2026-11-01T00:00:00Z'));
    expect(search('rim')).toEqual([]);
    restoreField(db, notes.id, new Date('2026-11-02T00:00:00Z'));
    expect(search('rim')).toEqual([figure(9)]);
    setFieldValue(db, { entity: 'model', entityId: elenaId, key: 'name' }, 'Elena Varga');
  });
});

describe('R24: models found by their fields and tags', () => {
  it('R24: lists the models a search finds as one line of links above the items', async () => {
    const response = await organize.get('/search?q=dancer');
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(
      '<p class="matched-models"><b>Models:</b> <a href="/models/elena-varga">Elena Varga</a></p>',
    );
    expect((await organize.get('/search?q=long+pos')).body).toContain('Elena Varga</a></p>');
    expect((await organize.get('/search?q=dancer+-poses')).body).not.toContain('matched-models');
  });

  it('R24: lists no models for a search without words', async () => {
    const response = await organize.get('/search?q=model%3AElena');
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('matched-models');
  });
});
