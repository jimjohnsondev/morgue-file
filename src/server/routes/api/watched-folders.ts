// Settings' watched folders table (R1, R36): add a folder, change a folder's location, rescan.
import { Type } from '@sinclair/typebox';

import { findRootById } from '#core/db/repositories/roots.js';
import { AppError } from '#core/errors.js';

import { addWatchedFolder, moveWatchedFolder } from '../../watched-folders.js';
import { requireLibrary } from '../require-library.js';

import type { WatchedFolderContext } from '../../watched-folders.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

const IdParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });
const FolderBody = Type.Object({ folder: Type.String({ maxLength: 4096 }) });

/** Registers the watched-folder changes. They refuse while no library is open. */
export function registerWatchedFolderApi(
  app: FastifyInstance,
  context: WatchedFolderContext,
): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  typed.post('/api/roots', { schema: { body: FolderBody } }, async (request) => {
    return { id: await addWatchedFolder(context, request.body.folder) };
  });
  typed.post(
    '/api/roots/:id/location',
    { schema: { params: IdParams, body: FolderBody } },
    async (request, reply) => {
      await moveWatchedFolder(context, request.params.id, request.body.folder);
      return reply.code(204).send();
    },
  );
  typed.post('/api/roots/:id/rescan', { schema: { params: IdParams } }, async (request, reply) => {
    const { db } = requireLibrary(context.library);
    if (findRootById(db, request.params.id) === undefined) {
      throw new AppError('not-found', `No watched folder ${String(request.params.id)}.`);
    }
    context.library?.rescanRoot(request.params.id);
    return reply.code(204).send();
  });
}
