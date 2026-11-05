// The edge states of the design brief (E1-E6), as the server draws them: an empty Unsorted, a
// search with no results, the Reference folder offline, an original that can't be opened, the
// index still running, and the outline and notice of a drop.
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clearItemMissing, markItemMissing } from '#core/db/repositories/item-files.js';
import { findItemIdsByPath, refileItemsByMappings } from '#core/db/repositories/items.js';
import { REFERENCE_ROOT_ID, setRootStatus } from '#core/db/repositories/roots.js';
import { insertFolderMapping, insertSubcategory } from '#core/db/repositories/subcategories.js';
import { tagItems } from '#core/db/repositories/tags.js';
import { setFieldValue } from '#core/fields/fields.js';
import { buildApp } from '#server/app.js';
import { findAppDir, LOOPBACK_HOST } from '#server/config.js';

import { addTestItem, makeTempLibrary } from '../support/temp-library.js';

import type { IndexingProgress, LibraryRuntime } from '#server/library-runtime.js';
import type { TempLibrary } from '../support/temp-library.js';
import type { FastifyInstance } from 'fastify';

const PORT = 47613;
const HOST = `127.0.0.1:${String(PORT)}`;

/** Where the test library's Reference folder is said to be; nothing needs to be there. */
const REFERENCE_DIR = 'E:\\Reference';

let library: TempLibrary;
let app: FastifyInstance;
let ids: Map<string, number>;
/** What the runtime reports about a running scan; each test sets its own. */
let indexing: IndexingProgress | undefined;

/** Two photos filed under Figure, so Unsorted is empty, and a PDF in Books. */
function seedLibrary(): void {
  const { db } = library;
  addTestItem(db, 'Figure/figure_0001.jpg');
  addTestItem(db, 'Figure/figure_0002.jpg');
  addTestItem(db, 'Books/Studies in Hands.pdf', 'pdf');
  const figure = insertSubcategory(db, 'photos', 'Figure');
  insertFolderMapping(db, {
    rootId: REFERENCE_ROOT_ID,
    relPrefix: 'Figure',
    subcategoryId: figure,
  });
  const books = insertSubcategory(db, 'library', 'Shelf');
  insertFolderMapping(db, { rootId: REFERENCE_ROOT_ID, relPrefix: 'Books', subcategoryId: books });
  refileItemsByMappings(db, REFERENCE_ROOT_ID);
  ids = findItemIdsByPath(db, REFERENCE_ROOT_ID);
  tagItems(db, [idOf('Figure/figure_0001.jpg')], 'hands');
  setFieldValue(
    db,
    { entity: 'item', entityId: idOf('Figure/figure_0002.jpg'), key: 'source_url' },
    'https://example.com/hand-study',
  );
}

/** The id of a seeded item, by its path. */
function idOf(relPath: string): number {
  const id = ids.get(relPath);
  if (id === undefined) {
    throw new Error(`No item at ${relPath}.`);
  }
  return id;
}

beforeAll(async () => {
  library = await makeTempLibrary(REFERENCE_DIR);
  seedLibrary();
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
    indexing: () => indexing,
    controlIndexing: () => Promise.resolve(),
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
    install: { current: { kind: 'ready', dataDir: library.dataDir, referenceDir: REFERENCE_DIR } },
    token: 'test-token',
    library: runtime,
  });
});

beforeEach(() => {
  indexing = undefined;
  setRootStatus(library.db, REFERENCE_ROOT_ID, 'online');
  clearItemMissing(library.db, idOf('Figure/figure_0001.jpg'));
});

afterAll(async () => {
  await app.close();
  await library.remove();
});

/** Fetches a page as this PC's browser would, and checks it rendered. */
async function getPage(url: string): Promise<string> {
  const response = await app.inject({ url, headers: { host: HOST } });
  expect(response.statusCode).toBe(200);
  return response.body;
}

/** The search page for a query, as the app links to it. */
function searchUrl(query: string): string {
  return `/search?${new URLSearchParams({ q: query }).toString()}`;
}

describe('E1: empty Unsorted', () => {
  it('says nothing is waiting, how files get here, and where to browse instead', async () => {
    const body = await getPage('/unsorted');
    expect(body).toContain('Nothing waiting to be filed.');
    expect(body).toContain('drop files into the Inbox folder inside your Reference folder');
    expect(body).toContain('<a href="/photos">Browse Photos</a>');
    expect(body).toContain('<a href="/library">Browse Library</a>');
    expect(body).toContain('Unsorted (0)');
  });
});

describe('E2: search with no results', () => {
  it('echoes the query and links to the search without each of its terms', async () => {
    const body = await getPage(searchUrl('tag:hands rating:5'));
    expect(body).toContain('No items match.');
    expect(body).toContain('<code class="page__title-query">tag:hands rating:5</code>');
    expect(body).toContain('Try the search without one of its parts:');
    const withoutHands = searchUrl('rating:5').replaceAll('&', '&amp;');
    const withoutRating = searchUrl('tag:hands').replaceAll('&', '&amp;');
    expect(body).toContain(`href="${withoutHands}">without <code>tag:hands</code>`);
    expect(body).toContain(`href="${withoutRating}">without <code>rating:5</code>`);
    expect(body).toContain('<a href="/search">Clear the search</a>');
  });

  it('offers nothing to drop on a search that found something', async () => {
    const body = await getPage(searchUrl('tag:hands'));
    expect(body).not.toContain('No items match.');
    expect(body).not.toContain('Try the search without');
  });
});

describe('E3: drive offline', () => {
  it('shows the band on any page while the Reference folder is offline', async () => {
    setRootStatus(library.db, REFERENCE_ROOT_ID, 'offline');
    for (const url of ['/', '/photos/figure', `/item/${String(idOf('Figure/figure_0001.jpg'))}`]) {
      const body = await getPage(url);
      expect(body).toContain('<b>Reference folder (E:\\Reference) is offline.</b>');
      expect(body).toContain('3 items are kept and will reappear when the drive is back.');
      expect(body).toContain('<a href="/settings">Change folder location</a>');
    }
  });

  it('keeps showing thumbnails, and leaves out items already missing from the count', async () => {
    setRootStatus(library.db, REFERENCE_ROOT_ID, 'offline');
    markItemMissing(library.db, idOf('Figure/figure_0001.jpg'), '2026-10-31T12:00:00.000Z');
    const body = await getPage('/photos/figure');
    expect(body).toContain('2 items are kept');
    expect(body).toMatch(/\/media\/thumb\/\d+\/320\?v=/);
  });

  it('shows no band while the folder is online', async () => {
    const body = await getPage('/photos/figure');
    expect(body).not.toContain('is offline.');
  });
});

describe('E4: original missing', () => {
  it('shows the cached thumbnail enlarged and says the drive is offline', async () => {
    setRootStatus(library.db, REFERENCE_ROOT_ID, 'offline');
    const id = idOf('Figure/figure_0001.jpg');
    const body = await getPage(`/item/${String(id)}`);
    expect(body).toContain('Viewer · figure_0001.jpg · zoom unavailable while offline');
    expect(body).toContain(`src="/media/thumb/${String(id)}/320?v=`);
    expect(body).toContain('The original can’t be opened right now.');
    expect(body).toContain(path.join(REFERENCE_DIR, 'Figure', 'figure_0001.jpg'));
    expect(body).toContain('and that drive is offline.');
    expect(body).toContain('<a href="/photos/figure">Back to Figure</a>');
    expect(body).not.toContain(`/media/original/${String(id)}`);
  });

  it('says the last scan didn’t find a file that went missing on an online drive', async () => {
    const id = idOf('Figure/figure_0001.jpg');
    markItemMissing(library.db, id, '2026-10-31T12:00:00.000Z');
    const body = await getPage(`/item/${String(id)}`);
    expect(body).toContain('Viewer · figure_0001.jpg · original missing');
    expect(body).toContain('and the last scan didn’t find it there.');
    expect(body).not.toContain('is offline.');
  });

  it('shows a Library item by its cover when its drive is offline', async () => {
    setRootStatus(library.db, REFERENCE_ROOT_ID, 'offline');
    const id = idOf('Books/Studies in Hands.pdf');
    const body = await getPage(`/item/${String(id)}`);
    expect(body).toContain(`src="/media/thumb/${String(id)}/320x464?v=`);
    expect(body).toContain('unavailable-viewer__thumb--cover');
    expect(body).not.toContain('data-reader');
  });

  it('opens the viewer as usual when the original is there', async () => {
    const id = idOf('Figure/figure_0001.jpg');
    const body = await getPage(`/item/${String(id)}`);
    expect(body).toContain(`/media/original/${String(id)}`);
    expect(body).not.toContain('The original can’t be opened right now.');
  });
});

describe('E5: first index running', () => {
  it('shows the bar under the tabs and the count in the footer while a scan runs', async () => {
    indexing = { found: 12_400, expected: 48_000, isPaused: false };
    const body = await getPage('/');
    expect(body).toContain('<b>Indexing 12,400 of 48,000 files</b>');
    expect(body).toContain('max="48000" value="12400"');
    expect(body).toContain('<span class="counter">12,400</span> files found so far');
    expect(body).toContain('indexing 12,400 of 48,000 files · ');
  });

  it('shows how many files were found before the total has been counted', async () => {
    indexing = { found: 900, expected: undefined, isPaused: false };
    const body = await getPage('/photos');
    expect(body).toContain('<b>Indexing 900 files</b>');
    expect(body).not.toContain(' of 48,000');
  });

  it('shows no bar once the scan has finished', async () => {
    const body = await getPage('/');
    expect(body).not.toContain('Indexing');
  });
});

describe('E6: drop in progress', () => {
  it('puts the drop outline, hidden until a drag, on every page', async () => {
    for (const url of ['/', '/photos', `/item/${String(idOf('Figure/figure_0001.jpg'))}`]) {
      const body = await getPage(url);
      expect(body).toContain('<div class="drop-outline" data-drop-outline="true" hidden>');
      expect(body).toContain('Drop to save to Unsorted');
    }
  });

  it('shows the Saved to Unsorted notice for the item a drop made, linking to it', async () => {
    const id = idOf('Figure/figure_0002.jpg');
    const body = await getPage(`/photos/figure?page=1&saved=${String(id)}`);
    expect(body).toContain('Saved to Unsorted');
    expect(body).toContain('<b>figure_0002.jpg</b> · from example.com');
    expect(body).toContain(`<a href="/item/${String(id)}">Open the item</a>`);
    expect(body).toContain('<a href="/unsorted">go to Unsorted</a>');
    expect(body).toContain('<a href="/photos/figure?page=1" aria-label="Dismiss notice">');
  });

  it('shows no notice for an item that doesn’t exist', async () => {
    const body = await getPage('/photos?saved=999999');
    expect(body).not.toContain('Saved to Unsorted');
  });
});
