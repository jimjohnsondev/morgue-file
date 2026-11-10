// GET /compare: the compare board (R22), the one page that opens in a window of its own. It has
// no banner, tabs or footer, so the references get the whole window; the trim strip and the panel
// title bar say whose window it is.
import { DocumentHead } from '../../views/layout/page-layout.js';
import { renderDocument } from '../../views/render.js';
import { CompareTemplate } from '../../views/templates/compare-template.js';
import { requireLibrary } from '../require-library.js';

import { buildCompareModel } from './compare-model.js';

import type { PageContext } from '../page-context.js';
import type { FastifyInstance } from 'fastify';

/** Registers GET /compare. */
export function registerCompareRoute(app: FastifyInstance, context: PageContext): void {
  app.get('/compare', async (_request, reply) => {
    const { db } = requireLibrary(context.library);
    const html = renderDocument(
      <html lang="en">
        <DocumentHead title="Compare board" token={context.token} assets={context.assets} />
        <body class="compare-window">
          <div class="trim" />
          <main class="compare-page">
            <CompareTemplate model={buildCompareModel(db)} />
          </main>
        </body>
      </html>,
    );
    return reply.type('text/html; charset=utf-8').send(html);
  });
}
