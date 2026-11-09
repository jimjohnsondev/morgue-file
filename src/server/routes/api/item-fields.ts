// Saving one of an item's own fields from its details panel (R11): the rating's [change], the
// notes box and each field's [change]. client/api-forms.ts posts the form with the token;
// nothing opens a dialog (R37).
import { Type } from '@sinclair/typebox';

import { saveItemField } from '#core/fields/item-fields.js';

import { requireLibrary } from '../require-library.js';

import type { LibraryRuntime } from '../../library-runtime.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

const ItemParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });

/**
 * The field's key and its new value. api-forms.ts leaves an emptied box out, so a missing value
 * clears the field. Notes are capped so a save still fits a keepalive request as the page closes.
 */
const ItemFieldBody = Type.Object(
  {
    key: Type.String({ minLength: 1, maxLength: 200 }),
    value: Type.Optional(Type.String({ maxLength: 20_000 })),
  },
  { additionalProperties: false },
);

/** Registers POST /api/items/<id>/fields. */
export function registerItemFieldApi(
  app: FastifyInstance,
  library: LibraryRuntime | undefined,
): void {
  app
    .withTypeProvider<TypeBoxTypeProvider>()
    .post(
      '/api/items/:id/fields',
      { schema: { params: ItemParams, body: ItemFieldBody } },
      async (request, reply) => {
        const { key, value } = request.body;
        saveItemField(requireLibrary(library).db, { itemId: request.params.id, key }, value ?? '');
        return reply.code(204).send();
      },
    );
}
