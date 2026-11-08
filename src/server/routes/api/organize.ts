// Tags, collections and filing (R9, R10): the selection's action panel (frame 13), the item
// page's tag and collection chips, and the suggestions under a tag field. client/bulk-actions.ts
// and client/api-forms.ts post these with the token; nothing here opens a dialog (R37).
import { Type } from '@sinclair/typebox';

import { findTagSuggestions } from '#core/db/repositories/tags.js';
import {
  collectSelection,
  createCollectionWith,
  fileSelection,
  tagSelection,
  uncollectSelection,
  untagSelection,
} from '#core/organize/bulk-changes.js';

import { requireLibrary } from '../require-library.js';

import type { LibraryRuntime } from '../../library-runtime.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

/** How many suggestions a tag field lists under itself. */
const SUGGESTION_COUNT = 8;

const NAME = Type.String({ minLength: 1, maxLength: 120 });
const ID = Type.Integer({ minimum: 1 });

/** The ids ticked on a page, or the query of a whole list ("all 1,236 in Figure"). */
export const SelectionSchema = Type.Union([
  Type.Object({ itemIds: Type.Array(ID, { minItems: 1, maxItems: 100_000 }) }),
  Type.Object({ query: Type.String({ minLength: 1, maxLength: 2000 }) }),
]);

/** Forms send their fields as text, so a collection's id comes as digits. */
const COLLECTION_CHOICE = Type.String({ pattern: '^[1-9][0-9]{0,15}$' });

const TagBody = Type.Object({ selection: SelectionSchema, tag: NAME });
const CollectBody = Type.Object({ selection: SelectionSchema, collection: COLLECTION_CHOICE });
const NewCollectionBody = Type.Object({ selection: SelectionSchema, name: NAME });

/** A filing choice: a subcategory id, or Unsorted. Sent as text, as the form's select holds it. */
const SUBCATEGORY_CHOICE = Type.String({ pattern: '^(unsorted|[1-9][0-9]{0,15})$' });
const FileBody = Type.Object({ selection: SelectionSchema, subcategory: SUBCATEGORY_CHOICE });

const ItemParams = Type.Object({ id: ID });
const ItemTagParams = Type.Object({ id: ID, tag: NAME });
const ItemCollectionParams = Type.Object({ id: ID, collection: ID });
const ItemCollectionBody = Type.Object({ collection: COLLECTION_CHOICE });
const ItemTagBody = Type.Object({ tag: NAME });

const SuggestionQuery = Type.Object({ prefix: Type.String({ maxLength: 120 }) });

/** The open library's database, or a refusal while it isn't open. */
function libraryDb(library: LibraryRuntime | undefined) {
  return requireLibrary(library).db;
}

/** Registers the action panel's changes; each answers how many items it changed. */
function registerSelectionRoutes(app: FastifyInstance, library: LibraryRuntime | undefined) {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  typed.post('/api/selection/tag', { schema: { body: TagBody } }, (request, reply) =>
    reply.send(tagSelection(libraryDb(library), request.body.selection, request.body.tag)),
  );
  typed.post('/api/selection/untag', { schema: { body: TagBody } }, (request, reply) =>
    reply.send(untagSelection(libraryDb(library), request.body.selection, request.body.tag)),
  );
  typed.post('/api/selection/collect', { schema: { body: CollectBody } }, (request, reply) =>
    reply.send(
      collectSelection(libraryDb(library), request.body.selection, Number(request.body.collection)),
    ),
  );
  typed.post('/api/selection/uncollect', { schema: { body: CollectBody } }, (request, reply) =>
    reply.send(
      uncollectSelection(
        libraryDb(library),
        request.body.selection,
        Number(request.body.collection),
      ),
    ),
  );
  typed.post(
    '/api/selection/new-collection',
    { schema: { body: NewCollectionBody } },
    (request, reply) =>
      reply.send(
        createCollectionWith(libraryDb(library), request.body.selection, request.body.name),
      ),
  );
  typed.post('/api/selection/file', { schema: { body: FileBody } }, (request, reply) => {
    const choice = request.body.subcategory;
    const subcategoryId = choice === 'unsorted' ? undefined : Number(choice);
    return reply.send(fileSelection(libraryDb(library), request.body.selection, subcategoryId));
  });
}

/** Registers the item page's Add tag, add to collection, and the [x] on its chips. */
function registerItemRoutes(app: FastifyInstance, library: LibraryRuntime | undefined) {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  typed.post(
    '/api/items/:id/tags',
    { schema: { params: ItemParams, body: ItemTagBody } },
    async (request, reply) => {
      tagSelection(libraryDb(library), { itemIds: [request.params.id] }, request.body.tag);
      return reply.code(204).send();
    },
  );
  typed.delete(
    '/api/items/:id/tags/:tag',
    { schema: { params: ItemTagParams } },
    async (request, reply) => {
      untagSelection(libraryDb(library), { itemIds: [request.params.id] }, request.params.tag);
      return reply.code(204).send();
    },
  );
  typed.post(
    '/api/items/:id/collections',
    { schema: { params: ItemParams, body: ItemCollectionBody } },
    async (request, reply) => {
      const collectionId = Number(request.body.collection);
      collectSelection(libraryDb(library), { itemIds: [request.params.id] }, collectionId);
      return reply.code(204).send();
    },
  );
  typed.delete(
    '/api/items/:id/collections/:collection',
    { schema: { params: ItemCollectionParams } },
    async (request, reply) => {
      uncollectSelection(
        libraryDb(library),
        { itemIds: [request.params.id] },
        request.params.collection,
      );
      return reply.code(204).send();
    },
  );
}

/** Registers the tag and collection changes, and the suggestions a tag field shows as you type. */
export function registerOrganizeApi(
  app: FastifyInstance,
  library: LibraryRuntime | undefined,
): void {
  registerSelectionRoutes(app, library);
  registerItemRoutes(app, library);
  app
    .withTypeProvider<TypeBoxTypeProvider>()
    .get('/api/tags', { schema: { querystring: SuggestionQuery } }, (request, reply) => {
      const tags = findTagSuggestions(
        libraryDb(library),
        request.query.prefix.trim(),
        SUGGESTION_COUNT,
      );
      return reply.send({ tags });
    });
}
