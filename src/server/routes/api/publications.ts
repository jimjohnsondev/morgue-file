// Making a folder of scanned pages one publication from the action panel, and turning it back from
// the publication's own page.
import { Type } from '@sinclair/typebox';

import {
  makeFolderPublication,
  unmakeFolderPublication,
} from '#core/organize/publication-folders.js';

import { requireLibrary } from '../require-library.js';

import { ID, ID_CHOICE, SelectionSchema } from './organize.js';

import type { LibraryRuntime } from '../../library-runtime.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

const PublicationBody = Type.Object({ selection: SelectionSchema, subcategory: ID_CHOICE });

const ItemParams = Type.Object({ id: ID });

/** Registers the two publication actions; each rescans the folder, so the change shows at once. */
export function registerPublicationApi(app: FastifyInstance, library: LibraryRuntime | undefined) {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  typed.post(
    '/api/selection/publication',
    { schema: { body: PublicationBody } },
    async (request, reply) => {
      const open = requireLibrary(library);
      const result = await makeFolderPublication(open.db, {
        selection: request.body.selection,
        subcategoryId: Number(request.body.subcategory),
        now: new Date(),
      });
      open.wakeQueue();
      return reply.send(result);
    },
  );
  typed.post(
    '/api/items/:id/publication/undo',
    { schema: { params: ItemParams } },
    async (request, reply) => {
      const open = requireLibrary(library);
      const folder = await unmakeFolderPublication(open.db, request.params.id, new Date());
      open.wakeQueue();
      return reply.send({ folder });
    },
  );
}
