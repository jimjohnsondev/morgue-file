import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { findFieldByKey } from '#core/db/repositories/fields.js';
import { findItemIdsByPath, refileItemsByMappings } from '#core/db/repositories/items.js';
import { linkModelToItems } from '#core/db/repositories/models.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import {
  findSubcategoryBySlug,
  insertFolderMapping,
  insertSubcategory,
} from '#core/db/repositories/subcategories.js';
import { tagItems } from '#core/db/repositories/tags.js';
import { setFieldValue, setPicklistChoices } from '#core/fields/fields.js';
import { DEFAULT_SQUARE, saveThumbnail, thumbnailPath } from '#core/jobs/thumbnail-files.js';
import { createModel } from '#core/models/models.js';
import { buildApp } from '#server/app.js';
import { findAppDir, LOOPBACK_HOST } from '#server/config.js';

import { addTestItem, makeTempLibrary } from '../support/temp-library.js';

import type { LibraryRuntime } from '#server/library-runtime.js';
import type { TempLibrary } from '../support/temp-library.js';
import type { FastifyInstance } from 'fastify';

const PORT = 47613;
const HOST = `127.0.0.1:${String(PORT)}`;
const FIGURE_COUNT = 200;

let library: TempLibrary;
let app: FastifyInstance;

/** Figure photos with rising file times, magazine issues with titles and dates, a model. */
function seedLibrary(db: TempLibrary['db']): void {
  for (let slot = 1; slot <= FIGURE_COUNT; slot++) {
    addTestItem(db, `Figure/figure_${String(slot).padStart(4, '0')}.jpg`);
  }
  addTestItem(db, 'Inbox/download_001.jpg');
  for (let issue = 1; issue <= 6; issue++) {
    addTestItem(
      db,
      `Magazines/Life Drawing Quarterly/Life Drawing Quarterly No. ${String(issue)}.pdf`,
      'pdf',
    );
  }
  addTestItem(db, 'Magazines/Gouache Monthly/Gouache Monthly No. 1.pdf', 'pdf');
  const figure = insertSubcategory(db, 'photos', 'Figure');
  insertFolderMapping(db, {
    rootId: REFERENCE_ROOT_ID,
    relPrefix: 'Figure',
    subcategoryId: figure,
  });
  const magazines = findSubcategoryBySlug(db, 'library', 'magazines')!;
  insertFolderMapping(db, {
    rootId: REFERENCE_ROOT_ID,
    relPrefix: 'Magazines',
    subcategoryId: magazines.id,
  });
  refileItemsByMappings(db, REFERENCE_ROOT_ID);
  setPicklistChoices(db, findFieldByKey(db, 'item', 'magazine_title')!.id, [
    'Life Drawing Quarterly',
    'Gouache Monthly',
  ]);
  const ids = findItemIdsByPath(db, REFERENCE_ROOT_ID);
  for (const [itemPath, id] of ids) {
    const issue = /Quarterly No\. (\d+)/.exec(itemPath)?.[1];
    if (itemPath.startsWith('Magazines/')) {
      const title = itemPath.split('/')[1]!;
      setFieldValue(
        db,
        { entity: 'item', entityId: id, key: 'magazine_title', subcategoryId: magazines.id },
        title,
      );
    }
    if (issue !== undefined) {
      const date = `${String(2020 + Math.ceil(Number(issue) / 4))}-${String(((Number(issue) - 1) % 4) * 3 + 3).padStart(2, '0')}-01`;
      setFieldValue(
        db,
        { entity: 'item', entityId: id, key: 'issue_date', subcategoryId: magazines.id },
        date,
      );
    }
  }
  const handIds = [...ids]
    .filter(([itemPath]) => /figure_000[1-5]/.test(itemPath))
    .map(([, id]) => id);
  tagItems(db, handIds, 'hands');
  linkModelToItems(db, createModel(db, 'Elena Varga'), { itemIds: handIds.slice(0, 3) });
}

beforeAll(async () => {
  library = await makeTempLibrary();
  seedLibrary(library.db);
  const runtime: LibraryRuntime = {
    open: () => ({
      db: library.db,
      thumbnails: {
        db: library.db,
        thumbsDir: path.join(library.dataDir, 'thumbs'),
        mediaTools: undefined,
      },
      wakeQueue: () => undefined,
    }),
    start: () => undefined,
    whenIndexed: () => Promise.resolve(),
    stop: () => Promise.resolve(),
  };
  app = await buildApp({
    config: {
      host: LOOPBACK_HOST,
      port: PORT,
      appDir: findAppDir(),
      homeDir: findAppDir(),
      version: '0.0.0-test',
    },
    install: { current: { kind: 'ready', dataDir: library.dataDir, referenceDir: undefined } },
    token: 'test-token',
    library: runtime,
  });
});

afterAll(async () => {
  await app.close();
  await library.remove();
});

/** Fetches a page as this PC's browser would. */
async function get(url: string) {
  return app.inject({ url, headers: { host: HOST } });
}

describe('R18: one paged Index grid for every list', () => {
  it('pages a subcategory 96 at a time, oldest first, with « Prev 1 2 3 Next »', async () => {
    const response = await get('/photos/figure?page=2');
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('200 items · showing 97–192 · page 2 of 3');
    expect(response.body).toContain('figure_0097.jpg');
    expect(response.body).not.toContain('figure_0096.jpg');
    expect(response.body).toContain('href="/photos/figure?page=3" rel="next"');
    expect(response.body).toContain('href="/photos/figure" rel="prev"');
  });

  it('keeps the chosen size and per-page count in every link', async () => {
    const response = await get('/photos/figure?per=48&size=large');
    expect(response.body).toContain('page 1 of 5');
    expect(response.body).toContain('href="/photos/figure?page=2&amp;per=48&amp;size=large"');
    expect(response.body).toContain('/media/thumb/');
    expect(response.body).toMatch(/\/media\/thumb\/\d+\/480\?v=/);
  });

  it('lists sections, Unsorted and tags through the same template', async () => {
    expect((await get('/photos')).body).toContain('201 items');
    expect((await get('/unsorted')).body).toContain('download_001.jpg');
    expect((await get('/tags/hands')).body).toContain('5 items');
  });

  it('shows the counts in the tab bar and footer', async () => {
    const body = (await get('/photos')).body;
    expect(body).toContain('Unsorted (1)');
    expect(body).toMatch(/<span class="counter">201<\/span> images/);
    expect(body).toContain('site last updated 31 Oct 2026');
  });

  it('answers 404 for a subcategory that does not exist', async () => {
    expect((await get('/photos/nowhere')).statusCode).toBe(404);
  });
});

describe('search and the filter panel', () => {
  it('echoes the query with counts per section and removable filters', async () => {
    const response = await get('/search?q=model%3AElena+tag%3Ahands');
    expect(response.body).toContain('tag:hands model:Elena');
    expect(response.body).toContain('3 results · 3 in Photos · page 1 of 1');
    expect(response.body).toContain('model: Elena Varga');
    expect(response.body).toContain('href="/search?q=model%3AElena"');
  });

  it('folds a filter panel submission into one canonical query', async () => {
    const response = await get(
      '/search?base=&in=photos&sub=figure&tag=hands&model=&rating=&collection=&words=figure_0001',
    );
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe(
      '/search?q=in%3Aphotos+sub%3Afigure+tag%3Ahands+figure_0001',
    );
  });
});

describe('the filter panel keeps what it has no control for', () => {
  /** The panel's hidden `base` field on a page. */
  async function baseOf(url: string): Promise<string> {
    const body = (await get(url)).body;
    const field = /<input type="hidden" name="base"( value="([^"]*)")?/.exec(body);
    return field === null ? 'no base field' : (field[2] ?? '');
  }

  it('keeps unsorted on the Unsorted page, whose panel has no subcategory choice', async () => {
    expect(await baseOf('/unsorted')).toBe('unsorted');
  });

  it('keeps sub: and type: on the search page', async () => {
    expect(await baseOf('/search?q=sub%3Afigure+type%3Ajpg+tag%3Ahands')).toBe(
      'sub:figure type:jpg',
    );
  });

  it('sends nothing the subcategory page’s controls already set', async () => {
    expect(await baseOf('/photos/figure')).toBe('');
  });
});

describe('typed queries never fail', () => {
  it('searches for a malformed rating as a word', async () => {
    const response = await get('/search?q=rating%3A9');
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('0 results');
  });

  it('answers 404 for a page that is not a section', async () => {
    expect((await get('/item/5')).statusCode).toBe(404);
  });
});

describe('R13: group-by on Index pages', () => {
  it('lists one entry per magazine title', async () => {
    const body = (await get('/library/magazines')).body;
    expect(body).toContain('7 issues across 2 titles');
    expect(body).toContain('href="/library/magazines/life-drawing-quarterly"');
  });

  it('lists a title’s issues by year, newest first', async () => {
    const body = (await get('/library/magazines/life-drawing-quarterly')).body;
    const order = ['No. 6', 'No. 5', 'No. 4', 'No. 1'].map((issue) => body.indexOf(`${issue} · `));
    expect(order.every((position) => position > 0)).toBe(true);
    expect(order).toEqual([...order].sort((left, right) => left - right));
    expect(body.indexOf('>2022 ')).toBeLessThan(body.indexOf('>2021 '));
  });
});

describe('thumbnails by id', () => {
  it('answers a missing thumbnail with the placeholder and queues it first', async () => {
    const id = findItemIdsByPath(library.db, REFERENCE_ROOT_ID).get('Figure/figure_0001.jpg')!;
    const response = await get(`/media/thumb/${String(id)}/320`);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('image/svg+xml');
    expect(response.headers['cache-control']).toBe('no-store');
    const job = library.db.prepare('SELECT priority FROM jobs WHERE item_id = ?').get(id);
    expect(job).toEqual({ priority: 0 });
  });

  it('serves the default size when a larger one can’t be made, and leaves its job alone', async () => {
    const id = findItemIdsByPath(library.db, REFERENCE_ROOT_ID).get('Figure/figure_0002.jpg')!;
    const thumbsDir = path.join(library.dataDir, 'thumbs');
    await saveThumbnail(thumbnailPath(thumbsDir, id, DEFAULT_SQUARE), Buffer.from('default'));
    library.db.prepare(`UPDATE items SET thumb_state = 'ready' WHERE id = ?`).run(id);
    // The Reference folder isn't there, so the Large square can't be made from the original.
    const response = await get(`/media/thumb/${String(id)}/480`);
    expect(response.headers['content-type']).toBe('image/webp');
    expect(response.body).toBe('default');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(library.db.prepare('SELECT 1 FROM jobs WHERE item_id = ?').get(id)).toBeUndefined();
  });

  it('refuses a size that does not fit the item, and unknown ids', async () => {
    const id = findItemIdsByPath(library.db, REFERENCE_ROOT_ID).get('Figure/figure_0001.jpg')!;
    expect((await get(`/media/thumb/${String(id)}/320x464`)).statusCode).toBe(404);
    expect((await get('/media/thumb/999999/320')).statusCode).toBe(404);
  });
});
