// R15 through the API and the pages: a selection of photos, videos or Library items is linked to
// a model in one request, a new model can be made on the way, and the item page links and
// unlinks one model at a time, in place (R37). Search finds the items by the model at once.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { findItemIdsByQuery } from '#core/db/repositories/item-lists.js';
import {
  findItemIdsByModel,
  findModelBySlug,
  linkModelToItems,
} from '#core/db/repositories/models.js';
import { createModel } from '#core/models/models.js';
import { compileQuery } from '#core/query/compile-query.js';
import { parseQuery } from '#core/query/parse-query.js';

import { FIGURE_COUNT, startOrganizeApp } from '../support/organize-app.js';

import type { OrganizeApp } from '../support/organize-app.js';

let organize: OrganizeApp;
let elenaId: number;

beforeAll(async () => {
  organize = await startOrganizeApp();
  elenaId = createModel(organize.db, 'Elena Varga');
});

afterAll(async () => {
  await organize.remove();
});

beforeEach(() => {
  organize.reset();
  organize.db.exec('DELETE FROM item_models');
});

/** The ids a search finds, as the Index page would list them. */
function searchIds(query: string): number[] {
  return findItemIdsByQuery(organize.db, compileQuery(parseQuery(query)));
}

describe('R15: tag photos, videos and Library items with models; bulk-tag a selection', () => {
  it('R15: tagging 200 photos with a model takes one action', async () => {
    const selected = organize.figureIds.slice(0, 200);
    const response = await organize.send('POST', '/api/selection/model', {
      selection: { itemIds: selected },
      model: String(elenaId),
      name: '',
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ modelId: elenaId, itemCount: 200 });
    expect(findItemIdsByModel(organize.db, elenaId)).toEqual(selected);
    expect(searchIds('model:"Elena Varga"')).toHaveLength(200);
  });

  it('R15: a whole list is linked by its query, and a Library item with photos', async () => {
    await organize.send('POST', '/api/selection/model', {
      selection: { query: 'in:photos sub:figure' },
      model: String(elenaId),
    });
    await organize.send('POST', '/api/selection/model', {
      selection: { itemIds: [organize.bookId, organize.figureIds[0]] },
      model: String(elenaId),
    });
    // Linking an item twice keeps one link.
    expect(findItemIdsByModel(organize.db, elenaId)).toHaveLength(FIGURE_COUNT + 1);
    expect(searchIds('in:library model:"Elena Varga"')).toEqual([organize.bookId]);
  });

  it('R15: "New model…" makes the model and links the selection to it', async () => {
    const response = await organize.send('POST', '/api/selection/model', {
      selection: { itemIds: organize.figureIds.slice(0, 3) },
      model: 'new',
      name: '  Modèle Deux ',
    });
    const { modelId } = response.json<{ modelId: number }>();
    expect(findModelBySlug(organize.db, 'modele-deux')?.id).toBe(modelId);
    expect(findItemIdsByModel(organize.db, modelId)).toEqual(organize.figureIds.slice(0, 3));
  });

  it('refuses a new model without a name, or with a name a model has, and links nothing', async () => {
    for (const name of ['', '   ', 'elena VARGA']) {
      const response = await organize.send('POST', '/api/selection/model', {
        selection: { itemIds: [organize.figureIds[0]] },
        model: 'new',
        name,
      });
      expect(response.statusCode).toBe(400);
    }
    expect(findItemIdsByModel(organize.db, elenaId)).toEqual([]);
  });

  it('refuses a DELETE naming half a page range, or a reversed one', async () => {
    const itemId = organize.figureIds[0]!;
    await organize.send('POST', `/api/items/${String(itemId)}/models`, { model: String(elenaId) });
    for (const pages of ['?from=12', '?to=19', '?from=19&to=12']) {
      const url = `/api/items/${String(itemId)}/models/${String(elenaId)}${pages}`;
      expect((await organize.send('DELETE', url)).statusCode).toBe(400);
    }
    expect(findItemIdsByModel(organize.db, elenaId)).toEqual([itemId]);
  });

  it('refuses a model that does not exist, and an item that does not exist', async () => {
    const noModel = await organize.send('POST', '/api/selection/model', {
      selection: { itemIds: [organize.figureIds[0]] },
      model: '9999',
    });
    expect(noModel.statusCode).toBe(404);
    const noItem = await organize.send('POST', '/api/selection/model', {
      selection: { itemIds: [organize.figureIds[0], 99_999] },
      model: String(elenaId),
    });
    expect(noItem.statusCode).toBe(404);
    expect(findItemIdsByModel(organize.db, elenaId)).toEqual([]);
  });
});

describe('R15 on the item page: add model and the [x] on a model chip', () => {
  it('R15: links one item, then its [x] unlinks it, in place', async () => {
    const itemId = organize.figureIds[0]!;
    const added = await organize.send('POST', `/api/items/${String(itemId)}/models`, {
      model: String(elenaId),
    });
    expect(added.statusCode, added.body).toBe(204);
    expect(searchIds('model:"Elena Varga"')).toEqual([itemId]);
    const removed = await organize.send(
      'DELETE',
      `/api/items/${String(itemId)}/models/${String(elenaId)}`,
    );
    expect(removed.statusCode).toBe(204);
    expect(searchIds('model:"Elena Varga"')).toEqual([]);
    const again = await organize.send(
      'DELETE',
      `/api/items/${String(itemId)}/models/${String(elenaId)}`,
    );
    expect(again.statusCode).toBe(404);
  });

  it('R15: the [x] on a page-range chip unlinks those pages only', async () => {
    const { bookId } = organize;
    linkModelToItems(organize.db, elenaId, { itemIds: [bookId], pages: [12, 19] });
    linkModelToItems(organize.db, elenaId, { itemIds: [bookId], pages: [30, 35] });
    const page = (await organize.get(`/item/${String(bookId)}`)).body;
    const action = `/api/items/${String(bookId)}/models/${String(elenaId)}?from=12&amp;to=19`;
    expect(page).toContain(`data-api-form="${action}"`);
    await organize.send(
      'DELETE',
      `/api/items/${String(bookId)}/models/${String(elenaId)}?from=12&to=19`,
    );
    const left = organize.db
      .prepare('SELECT page_from FROM item_models WHERE item_id = ?')
      .all(bookId) as { page_from: number }[];
    expect(left).toEqual([{ page_from: 30 }]);
  });

  it('R15: "add model" opens a form in place listing the models the item is not linked to', async () => {
    const itemId = organize.figureIds[0]!;
    const before = (await organize.get(`/item/${String(itemId)}`)).body;
    expect(before).toContain('data-edit-open="add-model"');
    expect(before).toContain(`<option value="${String(elenaId)}">Elena Varga</option>`);
    expect(before).toContain('<option value="new">New model…</option>');
    expect(before).not.toContain('<dialog');
    await organize.send('POST', `/api/items/${String(itemId)}/models`, { model: String(elenaId) });
    const after = (await organize.get(`/item/${String(itemId)}`)).body;
    expect(after).not.toContain(`<option value="${String(elenaId)}">Elena Varga</option>`);
    expect(after).toContain(
      `data-api-form="/api/items/${String(itemId)}/models/${String(elenaId)}"`,
    );
  });
});

describe('frame 13: the action panel Model group', () => {
  it('R15: lists the models and "New model…", with the new name field hidden until chosen', async () => {
    const body = (await organize.get('/photos/figure?select=on')).body;
    expect(body).toMatch(
      new RegExp(
        `<select id="selection-model" name="model" class="field" data-model-choice="true"><option value="${String(elenaId)}">Elena Varga</option>`,
      ),
    );
    expect(body).toContain('data-bulk-action="/api/selection/model"');
    expect(body).toMatch(/<input id="selection-model-name"[^>]* hidden/);
  });
});
