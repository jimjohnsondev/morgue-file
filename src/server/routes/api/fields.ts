// Settings' fields tables (R14, R36, R38): add a field to every item or every model, rename it,
// edit a pick-list's choices, move it up or down, remove it and restore it within 30 days.
// client/api-forms.ts posts them with the token; nothing here opens a dialog (R37).
import { Type } from '@sinclair/typebox';

import {
  addField,
  moveField,
  removeField,
  renameField,
  restoreField,
  setPicklistChoices,
} from '#core/fields/fields.js';

import { requireLibrary } from '../require-library.js';

import type { LibraryRuntime } from '../../library-runtime.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

const IdParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });
const MoveParams = Type.Object({
  id: Type.Integer({ minimum: 1 }),
  move: Type.Union([Type.Literal('up'), Type.Literal('down')]),
});

const LABEL = Type.String({ minLength: 1, maxLength: 120 });

const NewFieldBody = Type.Object({
  entity: Type.Union([Type.Literal('item'), Type.Literal('model')]),
  label: LABEL,
  type: Type.Union([
    Type.Literal('text'),
    Type.Literal('longtext'),
    Type.Literal('link'),
    Type.Literal('date'),
    Type.Literal('number'),
    Type.Literal('picklist'),
  ]),
});

const LabelBody = Type.Object({ label: LABEL });

/** A pick-list's choices as the form's one box holds them, separated by commas. */
const ChoicesBody = Type.Object({ choices: Type.String({ maxLength: 4000 }) });

/** Registers adding a field, renaming it and editing a pick-list's choices. */
function registerFieldEdits(app: FastifyInstance, library: LibraryRuntime | undefined): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  typed.post('/api/fields', { schema: { body: NewFieldBody } }, (request, reply) => {
    const field = addField(requireLibrary(library).db, request.body);
    return reply.send({ id: field.id });
  });
  typed.post(
    '/api/fields/:id/label',
    { schema: { params: IdParams, body: LabelBody } },
    async (request, reply) => {
      renameField(requireLibrary(library).db, request.params.id, request.body.label);
      return reply.code(204).send();
    },
  );
  typed.post(
    '/api/fields/:id/choices',
    { schema: { params: IdParams, body: ChoicesBody } },
    async (request, reply) => {
      const choices = request.body.choices.split(',');
      setPicklistChoices(requireLibrary(library).db, request.params.id, choices);
      return reply.code(204).send();
    },
  );
}

/** Registers moving a field up or down, removing it and restoring it within 30 days. */
function registerFieldPlacement(app: FastifyInstance, library: LibraryRuntime | undefined): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  typed.post(
    '/api/fields/:id/:move',
    { schema: { params: MoveParams } },
    async (request, reply) => {
      moveField(requireLibrary(library).db, request.params.id, request.params.move);
      return reply.code(204).send();
    },
  );
  typed.post(
    '/api/fields/:id/restore',
    { schema: { params: IdParams } },
    async (request, reply) => {
      restoreField(requireLibrary(library).db, request.params.id, new Date());
      return reply.code(204).send();
    },
  );
  typed.delete('/api/fields/:id', { schema: { params: IdParams } }, async (request, reply) => {
    removeField(requireLibrary(library).db, request.params.id, new Date());
    return reply.code(204).send();
  });
}

/** Registers the field changes Settings makes. */
export function registerFieldApi(app: FastifyInstance, library: LibraryRuntime | undefined): void {
  registerFieldEdits(app, library);
  registerFieldPlacement(app, library);
}
