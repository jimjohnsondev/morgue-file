// The Home page. For now an empty frame; PR 9 fills it with preview strips (frame 12).
import { countArchive } from '#core/db/repositories/archive-counts.js';

import { PageLayout } from '../../views/layout/page-layout.js';
import { renderDocument } from '../../views/render.js';

import type { PageContext } from '../page-context.js';
import type { FastifyInstance } from 'fastify';

/** Registers GET / . */
export function registerHomeRoute(app: FastifyInstance, context: PageContext): void {
  app.get('/', async (_request, reply) => {
    const db = context.library?.open()?.db;
    const html = renderDocument(
      <PageLayout
        title="Home"
        currentPath="/"
        token={context.token}
        assets={context.assets}
        counts={db && countArchive(db)}
      >
        <h1 class="page__title">Home</h1>
        <p>Nothing here yet.</p>
      </PageLayout>,
    );
    return reply.type('text/html; charset=utf-8').send(html);
  });
}
