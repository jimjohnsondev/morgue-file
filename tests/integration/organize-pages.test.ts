// Frame 13 and the item page (R9, R10, R37): an Index page in selection mode draws the action
// panel in place of the filters, with a tick box on every card, and the item page edits its tag
// and collection chips in place.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { findTagNamesByItem } from '#core/db/repositories/tags.js';

import { startOrganizeApp } from '../support/organize-app.js';

import type { OrganizeApp } from '../support/organize-app.js';

let organize: OrganizeApp;

beforeAll(async () => {
  organize = await startOrganizeApp();
});

afterAll(async () => {
  await organize.remove();
});

beforeEach(() => {
  organize.reset();
});

describe('frame 13: an Index page in selection mode', () => {
  it('links into selection mode from the toolbar, keeping the page', async () => {
    const body = (await organize.get('/photos/figure?page=2')).body;
    expect(body).toContain('<a href="/photos/figure?page=2&amp;select=on">Select items to tag</a>');
    expect(body).not.toContain('data-selection-panel');
  });

  it('draws the action panel in place of the filters, with a tick box and the tags on each card', async () => {
    const body = (await organize.get('/photos/figure?select=on')).body;
    expect(body).toContain('aria-label="Edit selected items"');
    expect(body).toContain('data-selection-query="in:photos sub:figure"');
    expect(body).toContain('all 250 in Figure');
    expect(body).toContain('<a href="/photos/figure">done selecting</a>');
    expect(body).not.toContain('aria-label="Filters"');
    expect(body).toContain('<a href="/photos/figure?filters=shown">» show filters</a>');
    expect(body.match(/data-select-item/g)).toHaveLength(96);
    expect(body).toContain(
      `value="${String(organize.figureIds[0])}" aria-label="Select figure_0001.jpg"`,
    );
    expect(body).toContain('data-tags="[&quot;foreshortened&quot;,&quot;four-limbs&quot;]"');
    // Move to subcategory offers Photos' subcategories, then Unsorted; never a dialog (R37).
    expect(body).toMatch(
      /<option value="\d+">Figure<\/option><option value="\d+">Hands<\/option><option value="unsorted">Unsorted<\/option>/,
    );
    expect(body).not.toContain('<dialog');
  });

  it('offers to take items out of the collection a collection page lists', async () => {
    const id = (
      await organize.send('POST', '/api/selection/new-collection', {
        selection: { itemIds: [organize.figureIds[0]] },
        name: 'Hands foreshortened',
      })
    ).json<{ collectionId: number }>().collectionId;
    const body = (await organize.get(`/collections/${String(id)}?select=on`)).body;
    expect(body).toContain('Remove from Hands foreshortened');
    expect(body).toContain(`<input type="hidden" name="collection" value="${String(id)}"/>`);
  });
});

describe('the item page edits its tags and collections in place (R9, R10, R37)', () => {
  it('adds a tag, and takes it off again with its [x]', async () => {
    const photo = organize.figureIds[20]!;
    const added = await organize.send('POST', `/api/items/${String(photo)}/tags`, {
      tag: 'back-lit',
    });
    expect(added.statusCode).toBe(204);
    const body = (await organize.get(`/item/${String(photo)}`)).body;
    expect(body).toContain(`data-api-form="/api/items/${String(photo)}/tags/back-lit"`);
    expect(body).toContain('aria-label="Remove tag back-lit"');
    expect(body).toMatch(
      /<input id="add-tag" name="tag" class="field suggest__field"[^>]*data-tag-suggest/,
    );
    expect(body).not.toMatch(/<input id="add-tag"[^>]*disabled/);
    await organize.send('DELETE', `/api/items/${String(photo)}/tags/back-lit`);
    expect(findTagNamesByItem(organize.db, photo)).toEqual([]);
  });

  it('lists only the collections an item is not in yet under "add to collection"', async () => {
    const photo = organize.figureIds[30]!;
    const holding = (
      await organize.send('POST', '/api/selection/new-collection', {
        selection: { itemIds: [photo] },
        name: 'Spring model session',
      })
    ).json<{ collectionId: number }>().collectionId;
    const other = (
      await organize.send('POST', '/api/selection/new-collection', {
        selection: { itemIds: [organize.figureIds[31]] },
        name: 'Gouache palettes',
      })
    ).json<{ collectionId: number }>().collectionId;
    const body = (await organize.get(`/item/${String(photo)}`)).body;
    expect(body).toContain(`<option value="${String(other)}">Gouache palettes</option>`);
    const collectionChoices = /<select id="add-collection-choice"[^>]*>(.*?)<\/select>/.exec(
      body,
    )?.[1];
    expect(collectionChoices).toBeDefined();
    expect(collectionChoices).not.toContain(`value="${String(holding)}"`);
    expect(body).toContain(
      `data-api-form="/api/items/${String(photo)}/collections/${String(holding)}"`,
    );
  });
});
