// The compare board's writes (R22): an Item page's "add to compare board", and the board's own
// remove, layout and window-place saves. Each needs the launch token, as every write does.
import { Type } from '@sinclair/typebox';

import {
  addToCompareBoard,
  CompareLayoutSchema,
  CompareWindowSchema,
  removeFromCompareBoard,
  saveCompareWindow,
  setCompareLayout,
} from '#core/compare/compare-board.js';

import { requireLibrary } from '../require-library.js';

import type { LibraryRuntime } from '../../library-runtime.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

const AddBody = Type.Object({ itemId: Type.Integer({ minimum: 1 }) });

const ItemParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });

const LayoutBody = Type.Object({ layout: CompareLayoutSchema });

/**
 * Registers POST /api/compare/items, DELETE /api/compare/items/:id, POST /api/compare/layout and
 * POST /api/compare/window. They refuse while no library is open.
 */
export function registerCompareBoardApi(
  app: FastifyInstance,
  library: LibraryRuntime | undefined,
): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  typed.post('/api/compare/items', { schema: { body: AddBody } }, (request, reply) => {
    addToCompareBoard(requireLibrary(library).db, request.body.itemId);
    return reply.code(204).send();
  });
  typed.delete('/api/compare/items/:id', { schema: { params: ItemParams } }, (request, reply) => {
    removeFromCompareBoard(requireLibrary(library).db, request.params.id);
    return reply.code(204).send();
  });
  typed.post('/api/compare/layout', { schema: { body: LayoutBody } }, (request, reply) => {
    setCompareLayout(requireLibrary(library).db, request.body.layout);
    return reply.code(204).send();
  });
  typed.post('/api/compare/window', { schema: { body: CompareWindowSchema } }, (request, reply) => {
    saveCompareWindow(requireLibrary(library).db, request.body);
    return reply.code(204).send();
  });
}
