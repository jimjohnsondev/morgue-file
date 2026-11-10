// R17 through the reader and the profile: "add model to pages 12–13" links a model to the pages
// on show, in place (R37), and the profile's Library strip opens the item at the first of them.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { findModelBySlug } from '#core/db/repositories/models.js';
import { createModel } from '#core/models/models.js';

import { startOrganizeApp } from '../support/organize-app.js';

import type { OrganizeApp } from '../support/organize-app.js';

/** How many pages the organize app's book, "Studies in Hands", has in these tests. */
const BOOK_PAGES = 96;

let organize: OrganizeApp;
let elenaId: number;

beforeAll(async () => {
  organize = await startOrganizeApp();
  elenaId = createModel(organize.db, 'Elena Varga');
  organize.db
    .prepare('UPDATE items SET page_count = ? WHERE id = ?')
    .run(BOOK_PAGES, organize.bookId);
});

afterAll(async () => {
  await organize.remove();
});

beforeEach(() => {
  organize.db.exec('DELETE FROM item_models');
});

/** The book's model links, as the item_models table holds them. */
function bookLinks() {
  return organize.db
    .prepare('SELECT model_id, page_from, page_to FROM item_models WHERE item_id = ?')
    .all(organize.bookId);
}

/** Posts the reader's "add model" form for the book, as client/api-forms.ts sends it. */
function addModelToPages(fields: Record<string, string>) {
  return organize.send('POST', `/api/items/${String(organize.bookId)}/models`, fields);
}

/** The links to the book's Item page in a piece of HTML, decoded. */
function bookLinksIn(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)]
    .map((match) => (match[1] ?? '').replaceAll('&amp;', '&'))
    .filter((href) => href.startsWith(`/item/${String(organize.bookId)}?`));
}

describe('R17: tag a page range in a Library item with a model', () => {
  it("R17: the profile's Library preview opens the item at that page", async () => {
    const reader = (await organize.get(`/item/${String(organize.bookId)}?page=12`)).body;
    expect(reader).toContain('add model to pages 12–13');
    expect(reader).toContain('<input type="hidden" name="from" value="12"/>');
    expect(reader).toContain('<input type="hidden" name="to" value="13"/>');
    const added = await addModelToPages({ model: String(elenaId), from: '12', to: '13' });
    expect(added.statusCode, added.body).toBe(204);
    expect(bookLinks()).toEqual([{ model_id: elenaId, page_from: 12, page_to: 13 }]);

    const profile = (await organize.get('/models/elena-varga')).body;
    expect(profile).toContain('pages 12–13');
    const [cardHref] = bookLinksIn(profile);
    expect(cardHref).toMatch(/[?&]page=12(&|$)/);
    const opened = (await organize.get(cardHref ?? '')).body;
    expect(opened).toContain('data-history-position="12"');
  });

  it('R17: "New model…" in the reader makes the model and links it to the pages on show', async () => {
    await addModelToPages({ model: 'new', name: 'Mara Lind', from: '30', to: '31' });
    const mara = findModelBySlug(organize.db, 'mara-lind');
    expect(bookLinks()).toEqual([{ model_id: mara?.id, page_from: 30, page_to: 31 }]);
  });

  it('R17: a model on other pages is still offered; one on these pages is not', async () => {
    await addModelToPages({ model: String(elenaId), from: '12', to: '13' });
    const option = `<option value="${String(elenaId)}">Elena Varga</option>`;
    const samePages = (await organize.get(`/item/${String(organize.bookId)}?page=12`)).body;
    expect(samePages).not.toContain(option);
    const otherPages = (await organize.get(`/item/${String(organize.bookId)}?page=40`)).body;
    expect(otherPages).toContain(option);
    expect(otherPages).toContain('add model to pages 40–41');
  });

  it('refuses pages past the end, a reversed or half range, and pages of a photo', async () => {
    const model = String(elenaId);
    const refusals = [
      { from: '95', to: String(BOOK_PAGES + 1) },
      { from: '13', to: '12' },
      { from: '12' },
      { from: '0', to: '1' },
    ];
    for (const pages of refusals) {
      expect((await addModelToPages({ model, ...pages })).statusCode).toBe(400);
    }
    const photoId = String(organize.figureIds[0]);
    const photo = await organize.send('POST', `/api/items/${photoId}/models`, {
      model,
      from: '1',
      to: '1',
    });
    expect(photo.statusCode).toBe(400);
    expect(bookLinks()).toEqual([]);
  });
});
