// GET /media/original/<id> streams an item's original, untouched and with HTTP Range support, and
// GET /media/page/<id>/<n> one page picture of a CBZ or page folder, and
// GET /media/page-strip/<id>/<n> that page's small picture for the reader's strip
// (docs/ARCHITECTURE.md, Thumbnails and media). Routes take item ids only, never paths.
import { Type } from '@sinclair/typebox';

import { statOriginal, streamOriginal } from '#core/archive/originals.js';
import { readPublicationPage } from '#core/archive/publication-pages.js';
import { findItemById } from '#core/db/repositories/items.js';
import { findRootById } from '#core/db/repositories/roots.js';
import { AppError } from '#core/errors.js';
import { makePageStripPicture } from '#core/jobs/workers/thumb-pages.js';

import { parseRangeHeader } from './byte-range.js';
import { mediaTypeOf } from './media-types.js';
import { requireLibrary } from './require-library.js';

import type { PagedOriginal } from '#core/archive/publication-pages.js';
import type { Db } from '#core/db/connection.js';
import type { Item } from '#core/db/repositories/items.js';
import type { LibraryRuntime } from '../library-runtime.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance, FastifyReply } from 'fastify';

/**
 * Originals can change on disk under the same id, so the browser must check before reusing a
 * copy; the time in Last-Modified lets it.
 */
const ORIGINAL_CACHING = 'no-cache';

/**
 * The strip's page pictures are addressed with the original's time (`?v=`), so a changed file
 * gets a new address and the browser can keep each one for good.
 */
const STRIP_CACHING = 'public, max-age=31536000, immutable';

/** An item and the folder of the root it sits under. */
type ItemOnDisk = { readonly item: Item; readonly rootPath: string };

/** Finds an item and its root, refusing ids that don't exist. */
function requireItemOnDisk(db: Db, itemId: number): ItemOnDisk {
  const item = findItemById(db, itemId);
  const root = item === undefined ? undefined : findRootById(db, item.rootId);
  if (item === undefined || root === undefined) {
    throw new AppError('not-found', `No item ${String(itemId)}.`);
  }
  return { item, rootPath: root.path };
}

/** Sends an original, or the one range of it the request asks for. */
async function sendOriginal(
  reply: FastifyReply,
  file: ItemOnDisk & { readonly rangeHeader: string | undefined },
): Promise<FastifyReply> {
  const { item, rootPath } = file;
  const fileStats = await statOriginal(rootPath, item.relPath);
  const request = parseRangeHeader(file.rangeHeader, fileStats.size);
  reply
    .type(mediaTypeOf(item.relPath))
    .header('accept-ranges', 'bytes')
    .header('cache-control', ORIGINAL_CACHING)
    .header('last-modified', new Date(fileStats.mtimeMs).toUTCString());
  if (request.kind === 'unsatisfiable') {
    return reply
      .code(416)
      .header('content-range', `bytes */${String(fileStats.size)}`)
      .send();
  }
  if (request.kind === 'whole') {
    return reply
      .header('content-length', fileStats.size)
      .send(streamOriginal(rootPath, item.relPath));
  }
  const { start, end } = request.range;
  return reply
    .code(206)
    .header('content-range', `bytes ${String(start)}-${String(end)}/${String(fileStats.size)}`)
    .header('content-length', end - start + 1)
    .send(streamOriginal(rootPath, item.relPath, request.range));
}

/**
 * Reads from a publication's pages. A publication that is gone or on an offline drive is refused
 * as not found, like a missing original, rather than failing as an internal error.
 */
async function readPublicationOrRefuse<Page>(
  original: PagedOriginal,
  read: (original: PagedOriginal) => Promise<Page>,
): Promise<Page> {
  try {
    return await read(original);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('not-found', `${original.relPath} can't be opened right now.`);
  }
}

/** The CBZ or page folder an item is, refusing any other kind: only they have page pictures. */
function requirePagedOriginal(db: Db, itemId: number): PagedOriginal {
  const { item, rootPath } = requireItemOnDisk(db, itemId);
  if (item.kind !== 'cbz' && item.kind !== 'pagefolder') {
    throw new AppError('not-found', 'Only CBZ files and page folders have page pictures.');
  }
  return { kind: item.kind, rootPath, relPath: item.relPath };
}

/** Registers GET /media/original/:id: the original file, for the image, video and PDF viewers. */
function registerOriginalRoute(app: FastifyInstance, library: LibraryRuntime | undefined): void {
  app
    .withTypeProvider<TypeBoxTypeProvider>()
    .get(
      '/media/original/:id',
      { schema: { params: Type.Object({ id: Type.Integer({ minimum: 1 }) }) } },
      async (request, reply) => {
        const { db } = requireLibrary(library);
        const file = requireItemOnDisk(db, request.params.id);
        if (file.item.kind === 'pagefolder') {
          throw new AppError('not-found', 'A page folder is opened a page at a time.');
        }
        return sendOriginal(reply, { ...file, rangeHeader: request.headers.range });
      },
    );
}

const PageParams = Type.Object({
  id: Type.Integer({ minimum: 1 }),
  page: Type.Integer({ minimum: 1 }),
});

/** Registers GET /media/page/:id/:page: one page picture of a CBZ or page folder. */
function registerPageRoute(app: FastifyInstance, library: LibraryRuntime | undefined): void {
  app
    .withTypeProvider<TypeBoxTypeProvider>()
    .get('/media/page/:id/:page', { schema: { params: PageParams } }, async (request, reply) => {
      const { db } = requireLibrary(library);
      const original = requirePagedOriginal(db, request.params.id);
      const page = await readPublicationOrRefuse(original, (paged) =>
        readPublicationPage(paged, request.params.page),
      );
      return reply
        .type(mediaTypeOf(page.fileName))
        .header('cache-control', ORIGINAL_CACHING)
        .send(page.bytes);
    });
}

/**
 * Registers GET /media/page-strip/:id/:page: a page's small picture for the reader's strip (R21),
 * made from the page each time it's asked for and kept by the browser.
 */
function registerPageStripRoute(app: FastifyInstance, library: LibraryRuntime | undefined): void {
  app
    .withTypeProvider<TypeBoxTypeProvider>()
    .get(
      '/media/page-strip/:id/:page',
      { schema: { params: PageParams } },
      async (request, reply) => {
        const { db } = requireLibrary(library);
        const original = requirePagedOriginal(db, request.params.id);
        const webp = await readPublicationOrRefuse(original, (paged) =>
          makePageStripPicture(paged, request.params.page),
        );
        return reply.type('image/webp').header('cache-control', STRIP_CACHING).send(webp);
      },
    );
}

/** Registers the routes that serve originals and page pictures to the viewers. */
export function registerOriginalRoutes(
  app: FastifyInstance,
  library: LibraryRuntime | undefined,
): void {
  registerOriginalRoute(app, library);
  registerPageRoute(app, library);
  registerPageStripRoute(app, library);
}
