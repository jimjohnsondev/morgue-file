// POST /api/indexing/<action>: the E5 bar's Pause and Resume, and the E3 band's Check again.
// client/live-status.ts sends them with the launch token; /events then shows what changed.
import { Type } from '@sinclair/typebox';

import { requireLibrary } from '../require-library.js';

import type { LibraryRuntime } from '../../library-runtime.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

const ActionParams = Type.Object({
  action: Type.Union([Type.Literal('pause'), Type.Literal('resume'), Type.Literal('check')]),
});

/** Registers the indexing actions. They refuse while no library is open. */
export function registerIndexingApi(
  app: FastifyInstance,
  library: LibraryRuntime | undefined,
): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  typed.post(
    '/api/indexing/:action',
    { schema: { params: ActionParams } },
    async (request, reply) => {
      requireLibrary(library);
      await library?.controlIndexing(request.params.action);
      return reply.code(204).send();
    },
  );
}
