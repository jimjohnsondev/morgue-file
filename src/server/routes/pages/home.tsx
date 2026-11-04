// The Home page (frame 12): preview strips and the archive's counts (R34). Before the library is
// open it still renders, without them.
import { Type } from '@sinclair/typebox';

import { countArchive } from '#core/db/repositories/archive-counts.js';

import { PageLayout } from '../../views/layout/page-layout.js';
import { renderDocument } from '../../views/render.js';
import { HomeTemplate } from '../../views/templates/home-template.js';

import { buildHomeModel, SHUFFLE_SEEDS } from './home-model.js';

import type { PageContext } from '../page-context.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

const DAY_MS = 24 * 60 * 60 * 1000;

/** `shuffle` picks another handful for From the archive; without it the picks change daily. */
const HomeQuerystring = Type.Object({
  shuffle: Type.Optional(Type.Integer({ minimum: 0, maximum: SHUFFLE_SEEDS - 1 })),
});

/** Registers GET / . */
export function registerHomeRoute(app: FastifyInstance, context: PageContext): void {
  app
    .withTypeProvider<TypeBoxTypeProvider>()
    .get('/', { schema: { querystring: HomeQuerystring } }, async (request, reply) => {
      const db = context.library?.open()?.db;
      const counts = db && countArchive(db);
      const seed = request.query.shuffle ?? Math.floor(Date.now() / DAY_MS) % SHUFFLE_SEEDS;
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
