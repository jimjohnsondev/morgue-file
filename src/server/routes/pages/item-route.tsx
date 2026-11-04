// GET /item/<id>: the Item page for every photo, video and Library item (R19), stepping through
// the Index it was opened from (?from=<q>).
import { Type } from '@sinclair/typebox';

import { countArchive } from '#core/db/repositories/archive-counts.js';

import { PageLayout } from '../../views/layout/page-layout.js';
import { renderDocument } from '../../views/render.js';
import { ItemTemplate } from '../../views/templates/item-template.js';
import { requireLibrary } from '../require-library.js';

import { buildItemPage } from './item-model.js';
import { ItemViewQuerystring, toItemView } from './item-view.js';

import type { PageContext } from '../page-context.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

/** Registers GET /item/:id. */
export function registerItemRoute(app: FastifyInstance, context: PageContext): void {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/item/:id',
    {
      schema: {
        params: Type.Object({ id: Type.Integer({ minimum: 1 }) }),
        querystring: ItemViewQuerystring,
      },
    },
    async (request, reply) => {
      const { db } = requireLibrary(context.library);
      const view = toItemView(request.query);
      const page = buildItemPage(db, request.params.id, view);
      const html = renderDocument(
        <PageLayout
          title={page.title}
          currentPath={`/${page.section}`}
          token={context.token}
          assets={context.assets}
          counts={countArchive(db)}
          isViewing={view.isViewing}
        >
          <ItemTemplate model={page.model} />
        </PageLayout>,
      );
      return reply.type('text/html; charset=utf-8').send(html);
    },
  );
}
