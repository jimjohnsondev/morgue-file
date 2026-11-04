// The Model profile page: /models/<slug> (frame 10, R16).
import { Type } from '@sinclair/typebox';

import { countArchive } from '#core/db/repositories/archive-counts.js';
import { findModelBySlug } from '#core/db/repositories/models.js';
import { AppError } from '#core/errors.js';

import { PageLayout } from '../../views/layout/page-layout.js';
import { renderDocument } from '../../views/render.js';
import { ModelProfileTemplate } from '../../views/templates/model-profile-template.js';
import { requireLibrary } from '../require-library.js';

import { buildModelProfileModel } from './model-profile-model.js';

import type { PageContext } from '../page-context.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

/** Registers GET /models/<slug>. */
export function registerModelRoute(app: FastifyInstance, context: PageContext): void {
  app
    .withTypeProvider<TypeBoxTypeProvider>()
    .get(
      '/models/:slug',
      { schema: { params: Type.Object({ slug: Type.String({ minLength: 1 }) }) } },
      async (request, reply) => {
        const { db } = requireLibrary(context.library);
        const model = findModelBySlug(db, request.params.slug);
        if (model === undefined) {
          throw new AppError('not-found', `No model "${request.params.slug}".`);
        }
        const profile = buildModelProfileModel(db, model);
        const html = renderDocument(
          <PageLayout
            title={profile.name}
            currentPath="/models"
            token={context.token}
            assets={context.assets}
            counts={countArchive(db)}
          >
            <ModelProfileTemplate model={profile} />
          </PageLayout>,
        );
        return reply.type('text/html; charset=utf-8').send(html);
      },
    );
}
