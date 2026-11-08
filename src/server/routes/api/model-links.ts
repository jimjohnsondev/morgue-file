// Linking items to models (R15): the action panel's Model group (frame 13), and the item page's
// "add model" and the [x] on its model chips. client/bulk-actions.ts and client/api-forms.ts post
// these with the token; nothing here opens a dialog (R37).
import { Type } from '@sinclair/typebox';

import { linkSelectionToModel, unlinkItemFromModel } from '#core/models/model-links.js';

import { requireLibrary } from '../require-library.js';

import { SelectionSchema } from './organize.js';

import type { ModelChoice } from '#core/models/model-links.js';
import type { LibraryRuntime } from '../../library-runtime.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

const ID = Type.Integer({ minimum: 1 });

/**
 * A model's id, or `new` for "New model…", sent as text as the form's select holds it. The name
 * field is sent too, empty unless the choice is `new`.
 */
const ModelFields = {
  model: Type.String({ pattern: '^(new|[1-9][0-9]{0,15})$' }),
  name: Type.Optional(Type.String({ maxLength: 120 })),
};

const SelectionModelBody = Type.Object({ selection: SelectionSchema, ...ModelFields });
const ItemParams = Type.Object({ id: ID });
const ItemModelBody = Type.Object(ModelFields);
const ItemModelParams = Type.Object({ id: ID, model: ID });

/** A link over a page range names its pages; the whole-item link names none. */
const LinkPagesQuery = Type.Object({
  from: Type.Optional(ID),
  to: Type.Optional(ID),
});

/** What the form chose: a model in its list, or a new one with the name typed. */
function modelChoice(fields: { readonly model: string; readonly name?: string }): ModelChoice {
  return fields.model === 'new'
    ? { newName: fields.name ?? '' }
    : { modelId: Number(fields.model) };
}

/** Registers the action panel's and the item page's model links. */
export function registerModelLinkApi(
  app: FastifyInstance,
  library: LibraryRuntime | undefined,
): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  typed.post('/api/selection/model', { schema: { body: SelectionModelBody } }, (request, reply) =>
    reply.send(
      linkSelectionToModel(
        requireLibrary(library).db,
        request.body.selection,
        modelChoice(request.body),
      ),
    ),
  );
  typed.post(
    '/api/items/:id/models',
    { schema: { params: ItemParams, body: ItemModelBody } },
    async (request, reply) => {
      const selection = { itemIds: [request.params.id] };
      linkSelectionToModel(requireLibrary(library).db, selection, modelChoice(request.body));
      return reply.code(204).send();
    },
  );
  typed.delete(
    '/api/items/:id/models/:model',
    { schema: { params: ItemModelParams, querystring: LinkPagesQuery } },
    async (request, reply) => {
      const { from, to } = request.query;
      unlinkItemFromModel(requireLibrary(library).db, {
        itemId: request.params.id,
        modelId: request.params.model,
        ...(from !== undefined && to !== undefined && { pages: [from, to] as const }),
      });
      return reply.code(204).send();
    },
  );
}
