// Settings' subcategory table (R5, R36): add, rename, map a folder, unmap it, remove; and the
// item page's [move], which files one item by hand. client/api-forms.ts posts them with the token.
import { Type } from '@sinclair/typebox';

import {
  addSubcategory,
  fileItem,
  mapFolder,
  removeSubcategory,
  renameSubcategoryTo,
  unmapFolder,
} from '#core/filing/subcategory-changes.js';

import { requireLibrary } from '../require-library.js';

import type { LibraryRuntime } from '../../library-runtime.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

const IdParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });

const NAME = Type.String({ minLength: 1, maxLength: 120 });
const FOLDER = Type.String({ maxLength: 4096 });

const NewSubcategoryBody = Type.Object({
  section: Type.Union([Type.Literal('photos'), Type.Literal('video'), Type.Literal('library')]),
  name: NAME,
  folder: Type.Optional(FOLDER),
});

const NameBody = Type.Object({ name: NAME });
const FolderBody = Type.Object({ folder: FOLDER });

/** A filing choice from the [move] form: a subcategory id, or Unsorted. */
const FilingBody = Type.Object({
  subcategory: Type.String({ pattern: '^(unsorted|[1-9][0-9]{0,15})$' }),
});

/** Registers the subcategory and folder-mapping changes. */
function registerSubcategoryRoutes(app: FastifyInstance, library: LibraryRuntime | undefined) {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  typed.post('/api/subcategories', { schema: { body: NewSubcategoryBody } }, (request, reply) => {
    const { body } = request;
    const id = addSubcategory(requireLibrary(library).db, { ...body, folder: body.folder });
    return reply.send({ id });
  });
  typed.post(
    '/api/subcategories/:id/name',
    { schema: { params: IdParams, body: NameBody } },
    async (request, reply) => {
      renameSubcategoryTo(requireLibrary(library).db, request.params.id, request.body.name);
      return reply.code(204).send();
    },
  );
  typed.post(
    '/api/subcategories/:id/folders',
    { schema: { params: IdParams, body: FolderBody } },
    async (request, reply) => {
      mapFolder(requireLibrary(library).db, request.params.id, request.body.folder);
      return reply.code(204).send();
    },
  );
  typed.delete(
    '/api/subcategories/:id',
    { schema: { params: IdParams } },
    async (request, reply) => {
      removeSubcategory(requireLibrary(library).db, request.params.id);
      return reply.code(204).send();
    },
  );
  typed.delete(
    '/api/folder-mappings/:id',
    { schema: { params: IdParams } },
    async (request, reply) => {
      unmapFolder(requireLibrary(library).db, request.params.id);
      return reply.code(204).send();
    },
  );
}

/** Registers the subcategory routes and the item page's filing by hand. */
export function registerSubcategoryApi(
  app: FastifyInstance,
  library: LibraryRuntime | undefined,
): void {
  registerSubcategoryRoutes(app, library);
  app
    .withTypeProvider<TypeBoxTypeProvider>()
    .post(
      '/api/items/:id/subcategory',
      { schema: { params: IdParams, body: FilingBody } },
      async (request, reply) => {
        const choice = request.body.subcategory;
        const subcategoryId = choice === 'unsorted' ? undefined : Number(choice);
        fileItem(requireLibrary(library).db, request.params.id, subcategoryId);
        return reply.code(204).send();
      },
    );
}
