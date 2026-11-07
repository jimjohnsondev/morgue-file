// R9 and R10 through the API: a selection is tagged, untagged, collected and filed in one
// request each, a whole list by its query, and a tag field suggests tags as you type. Nothing
// here moves a file on disk.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  findCollectionSummaries,
  findItemIdsByCollection,
} from '#core/db/repositories/collections.js';
import { findItemById } from '#core/db/repositories/items.js';
import { findSubcategoryBySlug } from '#core/db/repositories/subcategories.js';
import { findTagNamesByItem } from '#core/db/repositories/tags.js';

import { FIGURE_COUNT, startOrganizeApp } from '../support/organize-app.js';

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

/** How many items carry a tag. */
function countTagged(tag: string): number {
  const row = organize.db
    .prepare(
      `SELECT count(*) AS count FROM item_tags JOIN tags ON tags.id = item_tags.tag_id
       WHERE tags.name = ?`,
    )
    .get(tag) as { count: number };
  return row.count;
}

describe('R10: tags with autocomplete; bulk-tag a selection', () => {
  it('R10: tagging 200 selected items takes one action', async () => {
    const selected = organize.figureIds.slice(0, 200);
    const response = await organize.send('POST', '/api/selection/tag', {
      selection: { itemIds: selected },
      tag: 'contrapposto',
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ itemCount: 200 });
    expect(countTagged('contrapposto')).toBe(200);
    expect(findTagNamesByItem(organize.db, selected[199]!)).toContain('contrapposto');
    expect(findTagNamesByItem(organize.db, organize.figureIds[200]!)).not.toContain('contrapposto');
  });

  it('R10: "all 250 in Figure" tags the whole list, every page of it, in one action', async () => {
    const response = await organize.send('POST', '/api/selection/tag', {
      selection: { query: 'in:photos sub:figure' },
      tag: 'seated',
    });
    expect(response.json()).toEqual({ itemCount: FIGURE_COUNT });
    expect(countTagged('seated')).toBe(FIGURE_COUNT);
    expect(findTagNamesByItem(organize.db, organize.bookId)).not.toContain('seated');
  });

  it('R10: Remove takes the tag off the selection only', async () => {
    await organize.send('POST', '/api/selection/untag', {
      selection: { itemIds: organize.figureIds.slice(0, 3) },
      tag: 'foreshortened',
    });
    expect(countTagged('foreshortened')).toBe(2);
  });

  it('R10: a tag field suggests the tags that start with what is typed, most used first', async () => {
    const answer = (await organize.get('/api/tags?prefix=fo')).json<{ tags: unknown[] }>();
    expect(answer.tags).toEqual([
      { name: 'foreshortened', itemCount: 5 },
      { name: 'four-limbs', itemCount: 2 },
    ]);
    expect((await organize.get('/api/tags?prefix=FORE')).json()).toEqual({
      tags: [{ name: 'foreshortened', itemCount: 5 }],
    });
    // LIKE's wildcards are typed text, not patterns.
    expect((await organize.get('/api/tags?prefix=f_r')).json()).toEqual({ tags: [] });
  });

  it('refuses a selection naming an item that does not exist, and changes nothing', async () => {
    const response = await organize.send('POST', '/api/selection/tag', {
      selection: { itemIds: [organize.figureIds[0], 999_999] },
      tag: 'profile',
    });
    expect(response.statusCode).toBe(404);
    expect(countTagged('profile')).toBe(0);
  });
});

describe('R9: collections are flat, hand-picked sets; an item can sit in many', () => {
  it('R9: moving an item between collections never moves the file on disk', async () => {
    const file = path.join(organize.referenceDir, 'Figure', 'figure_0001.jpg');
    const before = { bytes: await readFile(file), mtime: (await stat(file)).mtimeMs };
    const photo = organize.figureIds[0]!;
    const made = await organize.send('POST', '/api/selection/new-collection', {
      selection: { itemIds: [photo] },
      name: 'Spring model session',
    });
    const spring = made.json<{ collectionId: number }>().collectionId;
    const other = (
      await organize.send('POST', '/api/selection/new-collection', {
        selection: { itemIds: [organize.figureIds[1]] },
        name: 'Hands foreshortened',
      })
    ).json<{ collectionId: number }>().collectionId;

    expect(
      (
        await organize.send('POST', `/api/items/${String(photo)}/collections`, {
          collection: String(other),
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await organize.send('DELETE', `/api/items/${String(photo)}/collections/${String(spring)}`))
        .statusCode,
    ).toBe(204);

    expect(findItemIdsByCollection(organize.db, spring)).toEqual([]);
    expect(findItemIdsByCollection(organize.db, other)).toEqual([organize.figureIds[1], photo]);
    expect(findItemById(organize.db, photo)?.relPath).toBe('Figure/figure_0001.jpg');
    expect(await readFile(file)).toEqual(before.bytes);
    expect((await stat(file)).mtimeMs).toBe(before.mtime);
  });

  it('R9: an item sits in several collections at once, and the action panel takes a page out of one', async () => {
    const selection = { itemIds: organize.figureIds.slice(0, 10) };
    const first = (
      await organize.send('POST', '/api/selection/new-collection', {
        selection,
        name: 'Gouache palettes',
      })
    ).json<{ collectionId: number; itemCount: number }>();
    expect(first.itemCount).toBe(10);
    const second = (
      await organize.send('POST', '/api/selection/new-collection', {
        selection,
        name: 'Old masters drapery',
      })
    ).json<{ collectionId: number }>().collectionId;
    await organize.send('POST', '/api/selection/uncollect', {
      selection: { itemIds: organize.figureIds.slice(0, 4) },
      collection: String(first.collectionId),
    });
    expect(findItemIdsByCollection(organize.db, first.collectionId)).toEqual(
      organize.figureIds.slice(4, 10),
    );
    expect(findItemIdsByCollection(organize.db, second)).toEqual(organize.figureIds.slice(0, 10));
  });

  it('adds a selection to the end of a collection, keeping the place of items already in it', async () => {
    const id = (
      await organize.send('POST', '/api/selection/new-collection', {
        selection: { itemIds: [organize.figureIds[5]] },
        name: 'Spring model session',
      })
    ).json<{ collectionId: number }>().collectionId;
    await organize.send('POST', '/api/selection/collect', {
      selection: { itemIds: [organize.figureIds[3], organize.figureIds[5]] },
      collection: String(id),
    });
    expect(findItemIdsByCollection(organize.db, id)).toEqual([
      organize.figureIds[5],
      organize.figureIds[3],
    ]);
  });

  it('refuses a second collection with the same name, ignoring case', async () => {
    const selection = { itemIds: [organize.figureIds[0]] };
    await organize.send('POST', '/api/selection/new-collection', {
      selection,
      name: 'Gouache palettes',
    });
    const again = await organize.send('POST', '/api/selection/new-collection', {
      selection,
      name: ' gouache PALETTES ',
    });
    expect(again.statusCode).toBe(400);
    expect(again.json<{ message: string }>().message).toContain('already a collection');
    expect(findCollectionSummaries(organize.db)).toHaveLength(1);
  });
});

describe('R5 from the action panel: Move to subcategory', () => {
  it('files a selection by hand, and refuses a selection with items of another section', async () => {
    const moved = await organize.send('POST', '/api/selection/file', {
      selection: { itemIds: organize.figureIds.slice(0, 3) },
      subcategory: String(organize.handsId),
    });
    expect(moved.json()).toEqual({ itemCount: 3 });
    expect(findItemById(organize.db, organize.figureIds[0]!)?.subcategoryId).toBe(organize.handsId);
    expect(findItemById(organize.db, organize.figureIds[0]!)?.isFiledByHand).toBe(true);

    const mixed = await organize.send('POST', '/api/selection/file', {
      selection: { itemIds: [organize.figureIds[10], organize.bookId] },
      subcategory: String(organize.handsId),
    });
    expect(mixed.statusCode).toBe(400);
    expect(mixed.json<{ message: string }>().message).toBe(
      "1 of the 2 selected items are in another section, so they can't go in Hands.",
    );
    expect(findItemById(organize.db, organize.figureIds[10]!)?.subcategoryId).not.toBe(
      organize.handsId,
    );
    // Put the three back, so the other tests see Figure whole.
    await organize.send('POST', '/api/selection/file', {
      selection: { itemIds: organize.figureIds.slice(0, 3) },
      subcategory: String(findSubcategoryBySlug(organize.db, 'photos', 'figure')!.id),
    });
  });
});
