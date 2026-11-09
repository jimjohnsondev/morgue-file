// The profile editor: /models/<slug>/edit (frame 14, R14). It shows the profile as one form;
// routes/api/model-profiles.ts saves it.
import { Type } from '@sinclair/typebox';

import { countArchive } from '#core/db/repositories/archive-counts.js';
import { findModelBySlug } from '#core/db/repositories/models.js';
import { AppError } from '#core/errors.js';

import { PageLayout } from '../../views/layout/page-layout.js';
import { renderDocument } from '../../views/render.js';
import { ModelEditTemplate } from '../../views/templates/model-edit-template.js';
import { readPageStatus, SavedQuerystring } from '../page-status.js';
import { requireLibrary } from '../require-library.js';

import { buildModelEditModel } from './model-edit-model.js';

import type { PageContext } from '../page-context.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

/** Registers GET /models/<slug>/edit. */
export function registerModelEditRoute(app: FastifyInstance, context: PageContext): void {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/models/:slug/edit',
    {
      schema: {
        params: Type.Object({ slug: Type.String({ minLength: 1 }) }),
        querystring: SavedQuerystring,
      },
    },
    async (request, reply) => {
      const { db } = requireLibrary(context.library);
      const model = findModelBySlug(db, request.params.slug);
      if (model === undefined) {
        throw new AppError('not-found', `No model "${request.params.slug}".`);
      }
      const editor = buildModelEditModel(db, model);
      const html = renderDocument(
        <PageLayout
          title={`Edit ${editor.name}`}
          currentPath="/models"
          token={context.token}
          assets={context.assets}
          counts={countArchive(db)}
          status={readPageStatus(context, { url: request.url, savedId: request.query.saved })}
        >
          <ModelEditTemplate model={editor} />
        </PageLayout>,
      );
      return reply.type('text/html; charset=utf-8').send(html);
    },
  );
}
