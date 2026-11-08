// POST /api/items/<id>/view: records that an item was opened, and where its viewer got to (R35).
// client/view-history.ts sends it with the launch token when an Item page opens, and again with
// the video time when the video pauses or the page is left. Home's first strip reads it back.
import { Type } from '@sinclair/typebox';

import { recordItemView } from '#core/db/repositories/item-views.js';
import { findItemById } from '#core/db/repositories/items.js';
import { AppError } from '#core/errors.js';

import { requireLibrary } from '../require-library.js';

import type { LibraryRuntime } from '../../library-runtime.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

const ItemParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });

/** The video time in seconds or the page reached; a photo has none. */
const ViewBody = Type.Object({
  position: Type.Optional(Type.Number({ minimum: 0, maximum: 1_000_000 })),
});

/** Registers POST /api/items/:id/view. It refuses while no library is open. */
export function registerHistoryApi(app: FastifyInstance, library: LibraryRuntime | undefined) {
  app
    .withTypeProvider<TypeBoxTypeProvider>()
    .post(
      '/api/items/:id/view',
      { schema: { params: ItemParams, body: ViewBody } },
      (request, reply) => {
        const { db } = requireLibrary(library);
        const itemId = request.params.id;
        if (findItemById(db, itemId) === undefined) {
          throw new AppError('not-found', `No item ${String(itemId)}.`);
        }
        const { position } = request.body;
        const viewedAt = new Date().toISOString();
        recordItemView(db, { itemId, viewedAt, ...(position === undefined ? {} : { position }) });
        return reply.code(204).send();
      },
    );
}
