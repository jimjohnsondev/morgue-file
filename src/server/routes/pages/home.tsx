// The Home page (frame 12): preview strips and the archive's counts (R34). Before the library is
// open it still renders, without them.
import { countArchive } from '#core/db/repositories/archive-counts.js';

import { PageLayout } from '../../views/layout/page-layout.js';
import { renderDocument } from '../../views/render.js';
import { HomeTemplate } from '../../views/templates/home-template.js';

import { ShuffleQuerystring, shuffleSeed } from './card-lists.js';
import { buildHomeModel } from './home-model.js';

import type { PageContext } from '../page-context.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

/** Registers GET / . */
export function registerHomeRoute(app: FastifyInstance, context: PageContext): void {
  app
    .withTypeProvider<TypeBoxTypeProvider>()
    .get('/', { schema: { querystring: ShuffleQuerystring } }, async (request, reply) => {
      const db = context.library?.open()?.db;
      const counts = db && countArchive(db);
      const seed = shuffleSeed(request.query.shuffle);
      const html = renderDocument(
        <PageLayout
          title="Home"
          currentPath="/"
          token={context.token}
          assets={context.assets}
          counts={counts}
        >
          <HomeTemplate model={db && counts && buildHomeModel(db, counts, seed)} />
        </PageLayout>,
      );
      return reply.type('text/html; charset=utf-8').send(html);
    });
}
