// Saving a model's profile from its edit page (frame 14, R14): the fields, the model tags and the
// portrait in one request. client/api-forms.ts posts the form with the token, then opens the
// profile again; nothing opens a dialog (R37).
import { Type } from '@sinclair/typebox';

import { saveModelProfile } from '#core/models/model-profiles.js';

import { requireLibrary } from '../require-library.js';

import type { LibraryRuntime } from '../../library-runtime.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

/** The prefix of a field's box in the form: `field.agency_link`. */
export const FIELD_INPUT_PREFIX = 'field.';

/** What the edit form may send: each field's box, the tags and the chosen portrait. */
const ProfileBody = Type.Object(
  {
    /** The model tags, one per line, as client/model-tag-editor.ts keeps them. */
    tags: Type.Optional(Type.String({ maxLength: 20_000 })),
    portrait: Type.Optional(Type.String({ pattern: '^[1-9][0-9]{0,15}$' })),
  },
  {
    patternProperties: { '^field\\.': Type.String({ maxLength: 20_000 }) },
    additionalProperties: false,
  },
);

const ModelParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });

/** The fields' values by key, from the boxes named `field.<key>`. */
function fieldValues(body: object): Map<string, string> {
  const values = new Map<string, string>();
  for (const [name, value] of Object.entries(body)) {
    if (name.startsWith(FIELD_INPUT_PREFIX) && typeof value === 'string') {
      values.set(name.slice(FIELD_INPUT_PREFIX.length), value);
    }
  }
  return values;
}

/** Registers POST /api/models/<id>/profile. */
export function registerModelProfileApi(
  app: FastifyInstance,
  library: LibraryRuntime | undefined,
): void {
  app
    .withTypeProvider<TypeBoxTypeProvider>()
    .post(
      '/api/models/:id/profile',
      { schema: { params: ModelParams, body: ProfileBody } },
      async (request, reply) => {
        const { tags, portrait } = request.body;
        saveModelProfile(requireLibrary(library).db, request.params.id, {
          values: fieldValues(request.body),
          tags: tags?.split('\n') ?? [],
          ...(portrait !== undefined && { portraitItemId: Number(portrait) }),
        });
        return reply.code(204).send();
      },
    );
}
