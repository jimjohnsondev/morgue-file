// GET /settings (frame 15): fields, subcategories with their folder mappings, and watched
// folders, each edited in place (R36). Refused while no library is open, as list pages are.
import path from 'node:path';

import { countArchive } from '#core/db/repositories/archive-counts.js';
import { findRootById, REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';

import { PageLayout } from '../../views/layout/page-layout.js';
import { renderDocument } from '../../views/render.js';
import { SettingsTemplate } from '../../views/templates/settings-template.js';
import { readPageStatus, SavedQuerystring } from '../page-status.js';
import { requireLibrary } from '../require-library.js';

import { buildSettingsModel } from './settings-model.js';

import type { Db } from '#core/db/connection.js';
import type { PageContext } from '../page-context.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

/** What the map-folder fields suggest: a folder inside the Reference folder (E:\Reference\…). */
function folderPlaceholder(db: Db): string {
  const reference = findRootById(db, REFERENCE_ROOT_ID);
  return reference === undefined ? 'E:\\Reference\\Figure' : path.join(reference.path, '…');
}

/** Registers GET /settings. */
export function registerSettingsPage(app: FastifyInstance, context: PageContext): void {
  app
    .withTypeProvider<TypeBoxTypeProvider>()
    .get('/settings', { schema: { querystring: SavedQuerystring } }, async (request, reply) => {
      const { db } = requireLibrary(context.library);
      const html = renderDocument(
        <PageLayout
          title="Settings"
          currentPath="/settings"
          token={context.token}
          assets={context.assets}
          counts={countArchive(db)}
          status={readPageStatus(context, { url: request.url, savedId: request.query.saved })}
        >
          <SettingsTemplate
            model={buildSettingsModel(db)}
            folderHint={{ placeholder: folderPlaceholder(db) }}
          />
        </PageLayout>,
      );
      return reply.type('text/html; charset=utf-8').send(html);
    });
}
