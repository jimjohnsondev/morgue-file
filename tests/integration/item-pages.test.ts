// The Item page (R19) and the routes its viewers read from (R21): Prev and Next in the order of
// the list an item was opened from, the details panel, and originals and pages served by id.
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ZipFile } from 'yazl';

import { addItemsToCollection, insertCollection } from '#core/db/repositories/collections.js';
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
import { createModel } from '#core/models/models.js';
import { buildApp } from '#server/app.js';
import { findAppDir, LOOPBACK_HOST } from '#server/config.js';

import { addTestItem, makeTempLibrary } from '../support/temp-library.js';

import type { LibraryRuntime } from '#server/library-runtime.js';
import type { TempLibrary } from '../support/temp-library.js';
import type { FastifyInstance } from 'fastify';

const PORT = 47613;
const HOST = `127.0.0.1:${String(PORT)}`;

/** The bytes of a small original, every value different so ranges can be checked. */
const PHOTO_BYTES = Buffer.from(Array.from({ length: 256 }, (_, index) => index));

let referenceDir: string;
let library: TempLibrary;
let app: FastifyInstance;
let ids: Map<string, number>;

/** Writes the few originals the media routes serve: a photo, a page folder and a CBZ. */
async function writeOriginals(): Promise<void> {
  await mkdir(path.join(referenceDir, 'Figure'), { recursive: true });
  await writeFile(path.join(referenceDir, 'Figure', 'figure_0001.jpg'), PHOTO_BYTES);
  const folder = path.join(referenceDir, 'Books', 'Folder Book');
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, '001.jpg'), 'page one');
  await writeFile(path.join(folder, '002.jpg'), 'page two');
  const zip = new ZipFile();
  const written = pipeline(
    zip.outputStream,
    createWriteStream(path.join(referenceDir, 'Books', 'Zip Book.cbz')),
  );
  zip.addBuffer(Buffer.from('zip page two'), '002.png');
  zip.addBuffer(Buffer.from('zip page one'), '001.png');
  zip.end();
  await written;
}

/** Ten Figure photos, a page folder and a CBZ in Books, three magazine issues with dates. */
function seedLibrary(db: TempLibrary['db']): void {
  for (let slot = 1; slot <= 10; slot++) {
    addTestItem(db, `Figure/figure_${String(slot).padStart(4, '0')}.jpg`);
  }
  addTestItem(db, 'Books/Folder Book', 'pagefolder');
  addTestItem(db, 'Books/Zip Book.cbz', 'cbz');
  for (let issue = 1; issue <= 3; issue++) {
    addTestItem(db, `Magazines/LDQ/LDQ No. ${String(issue)}.pdf`, 'pdf');
  }
  const figure = insertSubcategory(db, 'photos', 'Figure');
  insertFolderMapping(db, {
    rootId: REFERENCE_ROOT_ID,
    relPrefix: 'Figure',
    subcategoryId: figure,
  });
  const books = findSubcategoryBySlug(db, 'library', 'books')!;
  insertFolderMapping(db, {
    rootId: REFERENCE_ROOT_ID,
    relPrefix: 'Books',
    subcategoryId: books.id,
  });
  const magazines = findSubcategoryBySlug(db, 'library', 'magazines')!;
  insertFolderMapping(db, {
    rootId: REFERENCE_ROOT_ID,
    relPrefix: 'Magazines',
    subcategoryId: magazines.id,
  });
  refileItemsByMappings(db, REFERENCE_ROOT_ID);
  setPicklistChoices(db, findFieldByKey(db, 'item', 'magazine_title')!.id, ['LDQ']);
  ids = findItemIdsByPath(db, REFERENCE_ROOT_ID);
  for (let issue = 1; issue <= 3; issue++) {
    const owner = {
      entity: 'item' as const,
      entityId: ids.get(`Magazines/LDQ/LDQ No. ${String(issue)}.pdf`)!,
      subcategoryId: magazines.id,
    };
    setFieldValue(db, { ...owner, key: 'magazine_title' }, 'LDQ');
    setFieldValue(db, { ...owner, key: 'issue_date' }, `202${String(issue)}-12-01`);
  }
  // The thumbnail job would count the pages; the reader tests need a long issue.
  db.prepare('UPDATE items SET page_count = 72 WHERE kind = ?').run('pdf');
  const third = ids.get('Figure/figure_0003.jpg')!;
  tagItems(db, [third], 'hands');
  setFieldValue(db, { entity: 'item', entityId: third, key: 'rating' }, 4);
  setFieldValue(
    db,
    { entity: 'item', entityId: third, key: 'source_url' },
    'https://example.com/seated-backlit',
  );
  linkModelToItems(db, createModel(db, 'Elena Varga'), { itemIds: [third] });
  addItemsToCollection(db, insertCollection(db, 'Spring model session', '2026-10-01'), {
    itemIds: [third],
    addedAt: '2026-10-01',
  });
}

beforeAll(async () => {
  referenceDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-reference-'));
  await writeOriginals();
  library = await makeTempLibrary(referenceDir);
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
    install: { current: { kind: 'ready', dataDir: library.dataDir, referenceDir } },
    token: 'test-token',
    library: runtime,
  });
});

afterAll(async () => {
  await app.close();
  await library.remove();
  await rm(referenceDir, { recursive: true, force: true });
});

/** Fetches a page as this PC's browser would. */
async function get(url: string, headers: Record<string, string> = {}) {
  return app.inject({ url, headers: { host: HOST, ...headers } });
}

/** The address of an item's page, opened from a list. */
function itemUrl(relPath: string, from?: string): string {
  const id = String(ids.get(relPath));
  return from === undefined
    ? `/item/${id}`
    : `/item/${id}?${new URLSearchParams({ from }).toString()}`;
}

/** The link an item page's Prev or Next points at, with &amp; read back as &. */
function keyLink(body: string, name: 'previous' | 'next'): string | undefined {
  const match = new RegExp(`href="([^"]*)" rel="[a-z]+" data-key-link="${name}"`).exec(body);
  return match?.[1]?.replaceAll('&amp;', '&');
}

describe('R19: arrow keys move between items in the order of the Index you came from', () => {
  it('places the item in its list, with Prev and Next carrying the list on', async () => {
    const body = (await get(itemUrl('Figure/figure_0003.jpg', 'in:photos sub:figure'))).body;
    expect(body).toMatch(/<b>3<\/b> of 10 in <a href="\/photos\/figure">Figure<\/a>/);
    const from = 'from=in%3Aphotos+sub%3Afigure';
    expect(keyLink(body, 'previous')).toBe(
      `/item/${String(ids.get('Figure/figure_0002.jpg'))}?${from}`,
    );
    expect(keyLink(body, 'next')).toBe(
      `/item/${String(ids.get('Figure/figure_0004.jpg'))}?${from}`,
    );
  });

  it('follows a search list, and has no Prev on its first item', async () => {
    const body = (await get(itemUrl('Figure/figure_0003.jpg', 'tag:hands'))).body;
    expect(body).toContain('of 1 in <a href="/tags/hands">tag hands</a>');
    expect(keyLink(body, 'previous')).toBeUndefined();
    const search = (await get(itemUrl('Figure/figure_0005.jpg', 'figure_000'))).body;
    expect(search).toMatch(/<b>5<\/b> of 9 in <a href="\/search\?q=figure_000">search results/);
  });

  it('steps through a magazine title newest first, as its grouped page lists it', async () => {
    const from = 'in:library sub:magazines magazine_title:LDQ';
    const body = (await get(itemUrl('Magazines/LDQ/LDQ No. 3.pdf', from))).body;
    expect(body).toMatch(/<b>1<\/b> of 3 in <a href="\/library\/magazines\/ldq">LDQ<\/a>/);
    expect(keyLink(body, 'next')).toContain(
      `/item/${String(ids.get('Magazines/LDQ/LDQ No. 2.pdf'))}?`,
    );
    expect(body).toContain('<b>No. 3 · Winter 2023</b>');
  });

  it('steps through the item’s own subcategory when opened without a list', async () => {
    const body = (await get(itemUrl('Figure/figure_0010.jpg'))).body;
    expect(body).toContain('<b>10</b> of 10 in <a href="/photos/figure">Figure</a>');
    expect(keyLink(body, 'next')).toBeUndefined();
  });

  it('keeps viewing mode and the folded panel from one item to the next', async () => {
    const url = `${itemUrl('Figure/figure_0003.jpg', 'in:photos sub:figure')}&details=hidden&mode=viewing`;
    const body = (await get(url)).body;
    expect(body).toContain('<body class="viewing-mode">');
    expect(body).toContain('aria-label="Details, hidden"');
    expect(keyLink(body, 'next')).toMatch(/details=hidden&mode=viewing$/);
  });

  it('still opens an item whose list no longer holds it, without Prev and Next', async () => {
    const response = await get(itemUrl('Figure/figure_0003.jpg', 'tag:drapery rating:9'));
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('data-key-link');
  });

  it('answers 404 for an item that does not exist', async () => {
    expect((await get('/item/99999')).statusCode).toBe(404);
  });
});

describe('the details panel', () => {
  it('shows the facts, the chips and the item’s own fields (frame 5)', async () => {
    const body = (await get(itemUrl('Figure/figure_0003.jpg'))).body;
    expect(body).toContain(
      'Home</a> › <a href="/photos">Photos</a> › <a href="/photos/figure">Figure</a>',
    );
    expect(body).toContain('<th scope="row">File</th><td>figure_0003.jpg</td>');
    expect(body).toContain('aria-label="4 of 5">★★★★☆</span>');
    expect(body).toContain('aria-label="Remove tag hands"');
    expect(body).toContain('<a href="/models/elena-varga">Elena Varga</a>');
    expect(body).toContain('>Spring model session</a>');
    expect(body).toContain(
      '<a href="https://example.com/seated-backlit">example.com/seated-backlit</a>',
    );
  });

  it('names a magazine issue by its title and issue (frame 8)', async () => {
    const body = (await get(itemUrl('Magazines/LDQ/LDQ No. 2.pdf'))).body;
    expect(body).toContain('<a href="/library/magazines/ldq">LDQ</a></td>');
    expect(body).toContain('<th scope="row">Issue</th><td>No. 2 · Winter 2022</td>');
  });
});

describe('R21: the page reader', () => {
  it('shows a spread, links through the spreads and lists every page in the strip', async () => {
    const body = (await get(`${itemUrl('Magazines/LDQ/LDQ No. 3.pdf')}?page=13`)).body;
    expect(body).toContain('<b>Pages 12–13</b> of 72');
    expect(body).toContain('data-pdf-page="12"');
    expect(body).toMatch(/href="[^"]*page=11"[^>]*data-key-link="page-previous"/);
    expect(body.match(/class="page-strip__link"/g)).toHaveLength(72);
    expect(body).toContain('add model to pages 12–13');
  });

  it('shows one page at a time in single view, from the jump-to-page form', async () => {
    const body = (await get(`${itemUrl('Magazines/LDQ/LDQ No. 3.pdf')}?layout=single&page=40`))
      .body;
    expect(body).toContain('<b>Page 40</b> of 72');
    expect(body).toContain('<input type="hidden" name="layout" value="single"/>');
  });
});

describe('media for the viewers', () => {
  it('streams an original whole, or the one range asked for', async () => {
    const url = `/media/original/${String(ids.get('Figure/figure_0001.jpg'))}`;
    const whole = await get(url);
    expect(whole.statusCode).toBe(200);
    expect(whole.headers['accept-ranges']).toBe('bytes');
    expect(whole.rawPayload).toEqual(PHOTO_BYTES);
    const part = await get(url, { range: 'bytes=10-19' });
    expect(part.statusCode).toBe(206);
    expect(part.headers['content-range']).toBe('bytes 10-19/256');
    expect(part.rawPayload).toEqual(PHOTO_BYTES.subarray(10, 20));
    expect((await get(url, { range: 'bytes=900-' })).statusCode).toBe(416);
  });

  it('serves page n of a page folder and of a CBZ, in page order', async () => {
    const folder = await get(`/media/page/${String(ids.get('Books/Folder Book'))}/2`);
    expect(folder.body).toBe('page two');
    expect(folder.headers['content-type']).toBe('image/jpeg');
    const zip = await get(`/media/page/${String(ids.get('Books/Zip Book.cbz'))}/1`);
    expect(zip.body).toBe('zip page one');
    expect(zip.headers['content-type']).toBe('image/png');
    expect((await get(`/media/page/${String(ids.get('Books/Zip Book.cbz'))}/3`)).statusCode).toBe(
      404,
    );
  });

  it('refuses an original that is not there as not found', async () => {
    const response = await get(`/media/original/${String(ids.get('Figure/figure_0002.jpg'))}`);
    expect(response.statusCode).toBe(404);
  });
});
