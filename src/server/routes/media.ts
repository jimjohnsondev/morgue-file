// GET /media/thumb/<id>/<size> serves an item's cached thumbnail by id, never by path
// (docs/ARCHITECTURE.md, Thumbnails and media). A thumbnail that isn't made yet is answered with
// a blank placeholder, and its job jumps the queue so the page's retry finds it.
import { Type } from '@sinclair/typebox';

import { findItemById } from '#core/db/repositories/items.js';
import { AppError } from '#core/errors.js';
import {
  defaultThumbnailSize,
  hasSquareThumbnail,
  parseSizeLabel,
  readThumbnail,
  sizeToLabel,
  thumbnailPath,
} from '#core/jobs/thumbnail-files.js';
import { queueThumbnail } from '#core/jobs/thumbnail-jobs.js';
import { makeThumbnailAtSize } from '#core/jobs/thumbnails.js';

import { requireLibrary } from './require-library.js';

import type { Item } from '#core/db/repositories/items.js';
import type { ThumbnailSize } from '#core/jobs/thumbnail-files.js';
import type { LibraryRuntime, OpenLibrary } from '../library-runtime.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance, FastifyReply } from 'fastify';

const ThumbParams = Type.Object({
  id: Type.Integer({ minimum: 1 }),
  size: Type.String({ pattern: '^[0-9x]+$' }),
});

/**
 * A 1×1 transparent image. The page draws the gray behind it from tokens.css, and the client
 * retries any thumbnail that loads at this size.
 */
const PLACEHOLDER = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

/** Says whether a size suits an item: squares for photos and videos, the cover for the rest. */
function fitsItem(item: Item, size: ThumbnailSize): boolean {
  return hasSquareThumbnail(item.kind) === (size.width === size.height);
}

/** Answers with the placeholder, which must not be cached. */
function sendPlaceholder(reply: FastifyReply): FastifyReply {
  return reply.type('image/svg+xml').header('cache-control', 'no-store').send(PLACEHOLDER);
}

/** Says whether a size is the one the queue makes for the item. */
function isDefaultSize(item: Item, size: ThumbnailSize): boolean {
  return sizeToLabel(size) === sizeToLabel(defaultThumbnailSize(item.kind));
}

/** Moves the item's default thumbnail to the front of the queue. */
function hurryDefaultThumbnail(library: OpenLibrary, item: Item): void {
  queueThumbnail(library.db, {
    itemId: item.id,
    kind: item.kind,
    priority: 0,
    now: new Date().toISOString(),
  });
  library.wakeQueue();
}

/**
 * What a thumbnail request finds: the file at that size (cached forever), the default size
 * standing in while a larger one can't be made (not cached, so the real one is fetched once the
 * original is back), or nothing yet.
 */
type FoundThumbnail =
  { readonly kind: 'exact' | 'stand-in'; readonly bytes: Buffer } | { readonly kind: 'none' };

/** Wraps bytes that may not be there. */
function found(kind: 'exact' | 'stand-in', bytes: Buffer | undefined): FoundThumbnail {
  return bytes === undefined ? { kind: 'none' } : { kind, bytes };
}

/**
 * Reads the thumbnail at a size, making a non-default size from the original the first time.
 * Finds nothing while the default one is still waiting for the queue.
 */
async function findOrMakeThumbnail(
  library: OpenLibrary,
  item: Item,
  size: ThumbnailSize,
): Promise<FoundThumbnail> {
  const { thumbsDir } = library.thumbnails;
  const cached = await readThumbnail(thumbnailPath(thumbsDir, item.id, size));
  if (cached !== undefined || isDefaultSize(item, size) || item.thumbState !== 'ready') {
    return found('exact', cached);
  }
  try {
    const made = await makeThumbnailAtSize(library.thumbnails, item.id, size);
    return found('exact', await readThumbnail(made));
  } catch {
    // The original may be offline or unreadable; the default size stands in until it is back.
    const fallback = thumbnailPath(thumbsDir, item.id, defaultThumbnailSize(item.kind));
    return found('stand-in', await readThumbnail(fallback));
  }
}

/** Registers GET /media/thumb/:id/:size. */
export function registerMediaRoutes(app: FastifyInstance, library: LibraryRuntime | undefined) {
  app
    .withTypeProvider<TypeBoxTypeProvider>()
    .get('/media/thumb/:id/:size', { schema: { params: ThumbParams } }, async (request, reply) => {
      const open = requireLibrary(library);
      const item = findItemById(open.db, request.params.id);
      const size = parseSizeLabel(request.params.size);
      if (item === undefined || size === undefined || !fitsItem(item, size)) {
        throw new AppError('not-found', 'No such thumbnail.');
      }
      const thumbnail = await findOrMakeThumbnail(open, item, size);
      if (thumbnail.kind === 'none') {
        // Nothing found means the default file itself is missing; a failed one stays failed.
        if (item.thumbState !== 'failed') {
          hurryDefaultThumbnail(open, item);
        }
        return sendPlaceholder(reply);
      }
      const caching =
        thumbnail.kind === 'exact' ? 'public, max-age=31536000, immutable' : 'no-store';
      return reply.type('image/webp').header('cache-control', caching).send(thumbnail.bytes);
    });
}
