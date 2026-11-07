// GET /search/tips: the query language written out, linked from a search that found nothing (E2).
import { countArchive } from '#core/db/repositories/archive-counts.js';
import { findFieldsByEntity } from '#core/db/repositories/fields.js';

import { PageLayout } from '../../views/layout/page-layout.js';
import { renderDocument } from '../../views/render.js';
import { SearchTipsTemplate } from '../../views/templates/search-tips-template.js';
import { readPageStatus, SavedQuerystring } from '../page-status.js';
import { requireLibrary } from '../require-library.js';

import { SEARCH_TIPS_PATH } from './active-filters.js';

import type { PageContext } from '../page-context.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

/** Registers GET /search/tips. Its fields table lists the item fields a search can name. */
export function registerSearchTipsRoute(app: FastifyInstance, context: PageContext): void {
  app
    .withTypeProvider<TypeBoxTypeProvider>()
    .get(
      SEARCH_TIPS_PATH,
      { schema: { querystring: SavedQuerystring } },
      async (request, reply) => {
        const { db } = requireLibrary(context.library);
        // `group:` groups rather than searches, so a field made before the key was reserved
        // can't be searched by it and isn't listed. `rating:` does search the Rating field.
        const fields = findFieldsByEntity(db, 'item').filter(
          (field) => field.removedAt === undefined && field.key !== 'group',
        );
        const html = renderDocument(
          <PageLayout
            title="Search tips"
            currentPath="/search"
            token={context.token}
            assets={context.assets}
            counts={countArchive(db)}
            status={readPageStatus(context, { url: request.url, savedId: request.query.saved })}
          >
            <SearchTipsTemplate fields={fields} />
          </PageLayout>,
        );
        return reply.type('text/html; charset=utf-8').send(html);
      },
    );
}
