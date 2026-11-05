import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addItemsToCollection, insertCollection } from '#core/db/repositories/collections.js';
import { recordItemView } from '#core/db/repositories/item-views.js';
import { findItemIdsByPath, refileItemsByMappings } from '#core/db/repositories/items.js';
import { linkModelToItems, setModelPortrait, tagModel } from '#core/db/repositories/models.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { insertFolderMapping, insertSubcategory } from '#core/db/repositories/subcategories.js';
import { createModel } from '#core/models/models.js';
import { buildApp } from '#server/app.js';
import { findAppDir, LOOPBACK_HOST } from '#server/config.js';

import { addTestItem, makeTempLibrary } from '../support/temp-library.js';

import type { LibraryRuntime } from '#server/library-runtime.js';
import type { TempLibrary } from '../support/temp-library.js';
import type { FastifyInstance } from 'fastify';

const PORT = 47613;
const HOST = `127.0.0.1:${String(PORT)}`;

type TestSite = { readonly library: TempLibrary; readonly app: FastifyInstance };

let full: TestSite;
let bare: TestSite;

/** Starts the app on a library, as the server would once setup is done. */
async function startSite(library: TempLibrary): Promise<TestSite> {
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
    indexing: () => undefined,
    whenIndexed: () => Promise.resolve(),
    stop: () => Promise.resolve(),
  };
  const app = await buildApp({
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
  return { library, app };
}

/**
 * Twelve Figure photos and four magazine issues, an Unsorted download, a collection, a viewing
 * history, and Elena Varga in seven photos and two issues (page ranges) but no videos.
 */
function seedFull(db: TempLibrary['db']): void {
  for (let slot = 1; slot <= 12; slot++) {
    addTestItem(db, `Figure/figure_${String(slot).padStart(4, '0')}.jpg`);
  }
  for (let issue = 1; issue <= 4; issue++) {
    addTestItem(db, `Magazines/LDQ/Life Drawing Quarterly No. ${String(issue)}.pdf`, 'pdf');
  }
  addTestItem(db, 'Video/Poses/pose_session_01.mp4', 'video');
  addTestItem(db, 'Inbox/download_054.jpg');
  const figure = insertSubcategory(db, 'photos', 'Figure');
  insertFolderMapping(db, {
    rootId: REFERENCE_ROOT_ID,
    relPrefix: 'Figure',
    subcategoryId: figure,
  });
  refileItemsByMappings(db, REFERENCE_ROOT_ID);
  const ids = findItemIdsByPath(db, REFERENCE_ROOT_ID);
  function idOf(relPath: string): number {
    return ids.get(relPath) ?? 0;
  }
  const elena = createModel(db, 'Elena Varga');
  const photoIds = [...ids].filter(([relPath]) => /figure_000[1-7]/.test(relPath));
  linkModelToItems(db, elena, { itemIds: photoIds.map(([, id]) => id) });
  linkModelToItems(db, elena, {
    itemIds: [idOf('Magazines/LDQ/Life Drawing Quarterly No. 4.pdf')],
    pages: [12, 19],
  });
  linkModelToItems(db, elena, {
    itemIds: [idOf('Magazines/LDQ/Life Drawing Quarterly No. 1.pdf')],
    pages: [30, 35],
  });
  tagModel(db, elena, 'dancer');
  setModelPortrait(db, elena, idOf('Figure/figure_0003.jpg'));
  const spring = insertCollection(db, 'Spring model session', '2026-10-31T12:00:00.000Z');
  addItemsToCollection(db, spring, {
    itemIds: [idOf('Figure/figure_0002.jpg'), idOf('Figure/figure_0005.jpg')],
    addedAt: '2026-10-31T12:00:00.000Z',
  });
  recordItemView(db, { itemId: idOf('Figure/figure_0009.jpg'), viewedAt: '2026-10-30T10:00:00Z' });
  recordItemView(db, {
    itemId: idOf('Video/Poses/pose_session_01.mp4'),
    viewedAt: '2026-10-31T09:40:00Z',
    position: 42.12,
  });
  recordItemView(db, {
    itemId: idOf('Magazines/LDQ/Life Drawing Quarterly No. 4.pdf'),
    viewedAt: '2026-10-31T09:50:00Z',
    position: 12,
  });
}

beforeAll(async () => {
  const fullLibrary = await makeTempLibrary();
  seedFull(fullLibrary.db);
  full = await startSite(fullLibrary);
  const bareLibrary = await makeTempLibrary();
  addTestItem(bareLibrary.db, 'Figure/figure_0001.jpg');
  bare = await startSite(bareLibrary);
});

afterAll(async () => {
  for (const site of [full, bare]) {
    await site.app.close();
    await site.library.remove();
  }
});

/** Fetches a page from a site as this PC's browser would. */
async function get(site: TestSite, url: string) {
  return site.app.inject({ url, headers: { host: HOST } });
}

/** The HTML of the strip section a screen reader knows by this name, or undefined. */
function stripHtml(body: string, name: string): string | undefined {
  const start = body.indexOf(`<section aria-label="${name}"`);
  return start === -1 ? undefined : body.slice(start, body.indexOf('</section>', start));
}

/** Every href in a piece of HTML, decoded. */
function hrefsIn(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) =>
    (match[1] ?? '').replaceAll('&amp;', '&'),
  );
}

/** The links to Item pages in a piece of HTML, in order. */
function itemLinksIn(html: string): string[] {
  return hrefsIn(html).filter((href) => href.startsWith('/item/'));
}

const PHOTOS_OF_ELENA = '/search?q=in%3Aphotos+model%3A%22Elena+Varga%22';
const LIBRARY_OF_ELENA = '/search?q=in%3Alibrary+model%3A%22Elena+Varga%22';

describe('R16: profile previews, one strip per section with content', () => {
  it('R16: shows a Photos and a Library strip, each linking to that section filtered by the model', async () => {
    const response = await get(full, '/models/elena-varga');
    expect(response.statusCode).toBe(200);
    const photos = stripHtml(response.body, 'Photos featuring Elena Varga');
    const library = stripHtml(response.body, 'Library featuring Elena Varga');
    expect(photos).toContain('Photos · 7');
    expect(hrefsIn(photos ?? '')).toContain(PHOTOS_OF_ELENA);
    expect(photos).toContain('View all 7 in Photos »');
    expect(library).toContain('Library · 2');
    expect(hrefsIn(library ?? '')).toContain(LIBRARY_OF_ELENA);
    expect(library).toContain('pages 12–19');
    expect(library).toContain('pages 30–35');
  });

  it('R16: shows no strip and no link for a section the model is not in', async () => {
    const body = (await get(full, '/models/elena-varga')).body;
    expect(stripHtml(body, 'Video featuring Elena Varga')).toBeUndefined();
    expect(body).not.toContain('in%3Avideo');
    expect(body).toMatch(
      /Appears in:<\/b> <a href="[^"]+">Photos \(7\)<\/a> · <a href="[^"]+">Library \(2\)<\/a><\/p>/,
    );
  });

  it("R16: shows six of the model's photos, and its full list holds all seven", async () => {
    const photos =
      stripHtml((await get(full, '/models/elena-varga')).body, 'Photos featuring Elena Varga') ??
      '';
    expect(photos.match(/class="thumb-card /g)).toHaveLength(6);
    const list = await get(full, PHOTOS_OF_ELENA);
    expect(list.body).toContain('7 results · 7 in Photos');
  });

  it('R16: shows the portrait, fields, model tags and profile title', async () => {
    const body = (await get(full, '/models/elena-varga')).body;
    expect(body).toContain('<h1 class="page__title">Elena Varga</h1>');
    expect(body).toContain('portrait from <a href="/item/');
    expect(body).toContain('figure_0003.jpg');
    expect(body).toMatch(/<th scope="row">Name<\/th><td>Elena Varga<\/td>/);
    expect(body).toContain('<span class="chip">dancer</span>');
  });

  it('R16: answers 404 for a model that does not exist, and lists models at /models', async () => {
    expect((await get(full, '/models/nobody')).statusCode).toBe(404);
    const models = await get(full, '/models');
    expect(models.statusCode).toBe(200);
    expect(hrefsIn(models.body)).toContain('/models/elena-varga');
  });
});

describe('R34: Home is built from preview strips', () => {
  const STRIPS = [
    { name: 'Pick up where you left off', list: '/history' },
    { name: 'Recently added', list: '/recent' },
    { name: 'Waiting in Unsorted', list: '/unsorted' },
    { name: 'Collections', list: '/collections' },
    { name: 'From the archive', list: '/archive?shuffle=3' },
  ];

  it('R34: shows the five strips in order, each linking to its full list', async () => {
    const body = (await get(full, '/?shuffle=3')).body;
    const starts = STRIPS.map((strip) => body.indexOf(`<section aria-label="${strip.name}"`));
    expect(starts.every((start) => start > 0)).toBe(true);
    expect(starts).toEqual([...starts].sort((left, right) => left - right));
    for (const strip of STRIPS) {
      const html = stripHtml(body, strip.name) ?? '';
      expect(html).toContain('class="thumb-card ');
      expect(hrefsIn(html)).toContain(strip.list);
      expect((await get(full, strip.list)).statusCode).toBe(200);
    }
  });

  it('R34: lists recently viewed items newest first, with the time or page reached', async () => {
    const html = stripHtml((await get(full, '/')).body, 'Pick up where you left off') ?? '';
    const issue = html.indexOf('Life Drawing Quarterly No. 4');
    const video = html.indexOf('pose_session_01.mp4');
    const photo = html.indexOf('figure_0009.jpg');
    expect(issue).toBeGreaterThan(0);
    expect(video).toBeGreaterThan(issue);
    expect(photo).toBeGreaterThan(video);
    expect(html).toContain('Library › Unsorted · page 12');
    expect(html).toContain('Video › Unsorted · at 0:42');
  });

  it('R34: shuffles From the archive by seed: one seed picks the same items, the next others', async () => {
    const first = stripHtml((await get(full, '/?shuffle=3')).body, 'From the archive') ?? '';
    const again = stripHtml((await get(full, '/?shuffle=3')).body, 'From the archive') ?? '';
    const next = stripHtml((await get(full, '/?shuffle=4')).body, 'From the archive') ?? '';
    expect(first).toBe(again);
    expect(hrefsIn(first)).toContain('/?shuffle=4');
    expect(itemLinksIn(next)).not.toEqual(itemLinksIn(first));
  });

  it("R34: From the archive's full list starts with the strip's picks", async () => {
    const strip = stripHtml((await get(full, '/?shuffle=3')).body, 'From the archive') ?? '';
    const list = (await get(full, '/archive?shuffle=3')).body;
    expect(itemLinksIn(list)[0]).toBe(itemLinksIn(strip)[0]);
    expect(list).toContain('18 items');
  });

  it('R34: shows the archive counts beside the strips', async () => {
    const body = (await get(full, '/')).body;
    expect(body).toMatch(
      /<a href="\/photos">Photos<\/a><\/th><td><span class="counter">13<\/span>/,
    );
    expect(body).toMatch(/<a href="\/models">Models<\/a><\/th><td><span class="counter">1<\/span>/);
  });

  it('R34: hides a strip with nothing to show', async () => {
    const body = (await get(bare, '/')).body;
    expect(stripHtml(body, 'Pick up where you left off')).toBeUndefined();
    expect(stripHtml(body, 'Collections')).toBeUndefined();
    expect(stripHtml(body, 'Recently added')).toContain('figure_0001.jpg');
  });
});
