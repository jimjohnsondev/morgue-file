// A small library behind the real app, for the tag, collection and selection tests (R9, R10):
// 250 Figure photos (more than one action's 200, over three pages), a Hands subcategory, a book
// in Books, and one real file for the R9 check that nothing on disk changes.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { refileItemsByMappings } from '#core/db/repositories/items.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { rewriteItemSearch } from '#core/db/repositories/search-rows.js';
import {
  findSubcategoryBySlug,
  insertFolderMapping,
  insertSubcategory,
} from '#core/db/repositories/subcategories.js';
import { tagItems } from '#core/db/repositories/tags.js';
import { buildApp } from '#server/app.js';
import { findAppDir, LOOPBACK_HOST } from '#server/config.js';

import { addTestItem, makeTempLibrary } from './temp-library.js';

import type { Db } from '#core/db/connection.js';
import type { LibraryRuntime } from '#server/library-runtime.js';
import type { TempLibrary } from './temp-library.js';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

const PORT = 47613;
const HOST = `127.0.0.1:${String(PORT)}`;
const TOKEN = 'organize-test-token';

/** How many Figure photos the library holds. */
export const FIGURE_COUNT = 250;

/** The running app, its library and the items the tests act on. */
export type OrganizeApp = {
  readonly db: Db;
  readonly referenceDir: string;
  readonly figureIds: readonly number[];
  readonly handsId: number;
  readonly bookId: number;
  /** Asks for a page as this PC's browser would. */
  readonly get: (url: string) => Promise<LightMyRequestResponse>;
  /** Sends a write the way the page does: same origin, with the token. */
  readonly send: (
    method: 'POST' | 'DELETE',
    url: string,
    payload?: object,
  ) => Promise<LightMyRequestResponse>;
  /** Puts the seeded tags back and empties the collections, so each test starts the same. */
  readonly reset: () => void;
  readonly remove: () => Promise<void>;
};

/** Adds the Figure photos, Hands, the book and their mappings; returns the ids the tests use. */
function seedLibrary(db: Db) {
  const figureIds = Array.from({ length: FIGURE_COUNT }, (_, index) =>
    addTestItem(db, `Figure/figure_${String(index + 1).padStart(4, '0')}.jpg`),
  );
  const figure = insertSubcategory(db, 'photos', 'Figure');
  insertFolderMapping(db, {
    rootId: REFERENCE_ROOT_ID,
    relPrefix: 'Figure',
    subcategoryId: figure,
  });
  const handsId = insertSubcategory(db, 'photos', 'Hands');
  const bookId = addTestItem(db, 'Books/Studies in Hands.pdf', 'pdf');
  const books = findSubcategoryBySlug(db, 'library', 'books')!;
  insertFolderMapping(db, {
    rootId: REFERENCE_ROOT_ID,
    relPrefix: 'Books',
    subcategoryId: books.id,
  });
  refileItemsByMappings(db, REFERENCE_ROOT_ID);
  return { figureIds, handsId, bookId };
}

/** A runtime around a library, with nothing running in the background. */
export function runtimeFor(temp: Pick<TempLibrary, 'db' | 'dataDir'>): LibraryRuntime {
  return {
    open: () => ({
      db: temp.db,
      thumbnails: {
        db: temp.db,
        thumbsDir: path.join(temp.dataDir, 'thumbs'),
        mediaTools: undefined,
      },
      wakeQueue: () => undefined,
    }),
    start: () => undefined,
    indexing: () => undefined,
    controlIndexing: () => Promise.resolve(),
    watchRoot: () => undefined,
    rescanRoot: () => undefined,
    whenIndexed: () => Promise.resolve(),
    stop: () => Promise.resolve(),
  };
}

/** Builds the app on a fresh library holding the seeded items. */
export async function startOrganizeApp(): Promise<OrganizeApp> {
  const referenceDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-organize-'));
  await mkdir(path.join(referenceDir, 'Figure'), { recursive: true });
  await writeFile(path.join(referenceDir, 'Figure', 'figure_0001.jpg'), 'the first photo');
  const library = await makeTempLibrary(referenceDir);
  const seeded = seedLibrary(library.db);
  const app: FastifyInstance = await buildApp({
    config: {
      host: LOOPBACK_HOST,
      port: PORT,
      appDir: findAppDir(),
      homeDir: findAppDir(),
      version: '0.0.0-test',
    },
    install: { current: { kind: 'ready', dataDir: library.dataDir, referenceDir } },
    token: TOKEN,
    library: runtimeFor(library),
  });
  const writeHeaders = {
    host: HOST,
    origin: `http://${HOST}`,
    'sec-fetch-site': 'same-origin',
    'x-morgue-token': TOKEN,
  };
  return {
    db: library.db,
    referenceDir,
    ...seeded,
    get: (url) => app.inject({ url, headers: { host: HOST } }),
    send: (method, url, payload) =>
      app.inject({ method, url, headers: writeHeaders, ...(payload && { payload }) }),
    reset: () => {
      library.db.exec(
        'DELETE FROM collection_items; DELETE FROM collections; DELETE FROM item_tags',
      );
      rewriteItemSearch(library.db, [...seeded.figureIds, seeded.bookId]);
      tagItems(library.db, seeded.figureIds.slice(0, 5), 'foreshortened');
      tagItems(library.db, seeded.figureIds.slice(0, 2), 'four-limbs');
    },
    remove: async () => {
      await app.close();
      await library.remove();
      await rm(referenceDir, { recursive: true, force: true });
    },
  };
}
