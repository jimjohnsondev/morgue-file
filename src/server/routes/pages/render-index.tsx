// Renders an Index page inside the shared layout and sends it.
import { countArchive } from '#core/db/repositories/archive-counts.js';

import { PageLayout } from '../../views/layout/page-layout.js';
import { renderDocument } from '../../views/render.js';
import { IndexTemplate } from '../../views/templates/index-template.js';

import type { Db } from '#core/db/connection.js';
import type { IndexModel } from '../../views/templates/index-template.js';
import type { PageContext } from '../page-context.js';
import type { FastifyReply } from 'fastify';

/** What the layout needs besides the model: the tab it sits under and the search box text. */
export type IndexPageFrame = {
  readonly currentTab: string;
  readonly searchText?: string;
};

/** Sends an Index page: the model in the template, in the layout with the archive's counts. */
export function sendIndexPage(
  reply: FastifyReply,
  page: { context: PageContext; db: Db; model: IndexModel; frame: IndexPageFrame },
): FastifyReply {
  const { context, db, model, frame } = page;
  const html = renderDocument(
    <PageLayout
      title={model.echo === undefined ? model.title : `${model.title} ${model.echo}`}
      currentPath={frame.currentTab}
      token={context.token}
      assets={context.assets}
      counts={countArchive(db)}
      searchText={frame.searchText}
    >
      <IndexTemplate model={model} />
    </PageLayout>,
  );
  return reply.type('text/html; charset=utf-8').send(html);
}
