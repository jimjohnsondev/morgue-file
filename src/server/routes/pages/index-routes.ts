// The Index pages for sections, subcategories, Unsorted, tags and collections (R18). Each one is
// a query shown by the Index template (docs/ARCHITECTURE.md, Server, routes and templates).
import { Type } from '@sinclair/typebox';

import { findCollectionSummaries } from '#core/db/repositories/collections.js';
import { findSubcategoryBySlug } from '#core/db/repositories/subcategories.js';
import { AppError } from '#core/errors.js';
import { filterTerm } from '#core/query/parse-query.js';

import { requireLibrary } from '../require-library.js';

import { SECTION_LABELS } from './filter-choices.js';
import { buildGroupListModel, buildGroupPageModel, groupSpecFor } from './group-model.js';
import { buildListModel } from './list-model.js';
import { ListViewQuerystring, toListView } from './list-view.js';
import { sendIndexPage } from './render-index.js';

import type { Db } from '#core/db/connection.js';
import type { Section } from '#core/db/repositories/items.js';
import type { Subcategory } from '#core/db/repositories/subcategories.js';
import type { Term } from '#core/query/query-types.js';
import type { IndexModel } from '../../views/templates/index-template.js';
import type { PageContext } from '../page-context.js';
import type { ListSpec } from './list-model.js';
import type { ListView } from './list-view.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { TSchema } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';

const SECTIONS: readonly Section[] = ['photos', 'video', 'library'];

const HOME_CRUMB = { label: 'Home', href: '/' } as const;

/** Any first path segment: pages not built yet (/models/elena-varga) must answer 404, not 400. */
const SectionParam = Type.String({ minLength: 1 });

/** Says whether a path segment names a section. */
function isSection(segment: string): segment is Section {
  return (SECTIONS as readonly string[]).includes(segment);
}

/** One Index route: its URL, the schema of its path parameters, and how it builds its page. */
type IndexRoute<Params> = {
  readonly url: string;
  readonly params: TSchema;
  readonly modelFor: (db: Db, params: Params, view: ListView) => IndexModel;
};

/** Registers one Index page. Its tab is its section's, else the first part of its path. */
function registerIndexPage<Params>(
  app: FastifyInstance,
  context: PageContext,
  route: IndexRoute<Params>,
): void {
  app
    .withTypeProvider<TypeBoxTypeProvider>()
    .get(
      route.url,
      { schema: { querystring: ListViewQuerystring, params: route.params } },
      async (request, reply) => {
        const { db } = requireLibrary(context.library);
        // Fastify has checked the parameters against route.params, which describes Params.
        const model = route.modelFor(db, request.params as Params, toListView(request.query));
        const currentTab = `/${request.url.split(/[/?]/)[1] ?? ''}`;
        return sendIndexPage(reply, { context, db, model, frame: { currentTab } });
      },
    );
}

/** A list that isn't confined to one section, such as Unsorted or a tag. */
function crossSectionSpec(
  path: string,
  page: {
    readonly terms: readonly Term[];
    readonly title: string;
    readonly crumbs: ListSpec['breadcrumb'];
    readonly emptyText: string;
  },
): ListSpec {
  return {
    address: { path },
    query: { terms: page.terms },
    title: page.title,
    breadcrumb: [HOME_CRUMB, ...page.crumbs],
    section: undefined,
    isSearch: false,
    isShelf: false,
    emptyText: page.emptyText,
  };
}

/** A whole section: /photos, /video, /library. */
function sectionSpec(section: Section): ListSpec {
  return {
    address: { path: `/${section}` },
    query: { terms: [filterTerm('in', section)] },
    title: SECTION_LABELS[section],
    breadcrumb: [HOME_CRUMB, { label: SECTION_LABELS[section] }],
    section,
    isSearch: false,
    isShelf: section === 'library',
    emptyText: `Nothing in ${SECTION_LABELS[section]} yet.`,
  };
}

/** One subcategory: /photos/figure, /library/books. */
function subcategorySpec(subcategory: Subcategory): ListSpec {
  const { section } = subcategory;
  return {
    address: { path: `/${section}/${encodeURIComponent(subcategory.slug)}` },
    query: { terms: [filterTerm('in', section), filterTerm('sub', subcategory.slug)] },
    title: subcategory.name,
    breadcrumb: [
      HOME_CRUMB,
      { label: SECTION_LABELS[section], href: `/${section}` },
      { label: subcategory.name },
    ],
    section,
    isSearch: false,
    isShelf: subcategory.thumbShape === 'cover',
    emptyText: `Nothing in ${subcategory.name} yet.`,
  };
}

/** The subcategory at /<section>/<slug>; the slug arrives percent-decoded. */
function requireSubcategory(db: Db, params: { section: string; slug: string }): Subcategory {
  const subcategory = isSection(params.section)
    ? findSubcategoryBySlug(db, params.section, params.slug)
    : undefined;
  if (subcategory === undefined) {
    throw new AppError('not-found', `No subcategory "${params.slug}" in ${params.section}.`);
  }
  return subcategory;
}

/** A subcategory's page: its grouped values if it groups by a field (Magazines), else its items. */
function subcategoryModel(db: Db, params: { section: string; slug: string }, view: ListView) {
  const subcategory = requireSubcategory(db, params);
  const groupSpec = groupSpecFor(db, subcategory);
  return groupSpec === undefined
    ? buildListModel(db, subcategorySpec(subcategory), view)
    : buildGroupListModel(db, subcategory, groupSpec);
}

/** One grouped value's page: /library/magazines/life-drawing-quarterly (frame 3). */
function groupPageModel(db: Db, params: { section: string; slug: string; group: string }) {
  const subcategory = requireSubcategory(db, params);
  const spec = groupSpecFor(db, subcategory);
  if (spec === undefined) {
    throw new AppError('not-found', `${subcategory.name} isn't grouped.`);
  }
  return buildGroupPageModel(db, subcategory, { spec, groupSlug: params.group });
}

/** A collection's items, in the collection's own list. */
function collectionModel(db: Db, params: { id: number }, view: ListView): IndexModel {
  const collection = findCollectionSummaries(db).find((summary) => summary.id === params.id);
  if (collection === undefined) {
    throw new AppError('not-found', `No collection ${String(params.id)}.`);
  }
  const spec = crossSectionSpec(`/collections/${String(collection.id)}`, {
    terms: [filterTerm('collection', String(collection.id))],
    title: collection.name,
    crumbs: [{ label: 'Collections' }, { label: collection.name }],
    emptyText: 'This collection is empty.',
  });
  return buildListModel(db, spec, view);
}

/** Unsorted: everything with no subcategory, from every section. */
function unsortedModel(db: Db, _params: unknown, view: ListView): IndexModel {
  const spec = crossSectionSpec('/unsorted', {
    terms: [filterTerm('unsorted', '')],
    title: 'Unsorted',
    crumbs: [{ label: 'Unsorted' }],
    emptyText: 'Nothing waiting to be filed.',
  });
  return buildListModel(db, spec, view);
}

/** Everything with one tag: /tags/hands. */
function tagModel(db: Db, params: { name: string }, view: ListView): IndexModel {
  const spec = crossSectionSpec(`/tags/${encodeURIComponent(params.name)}`, {
    terms: [filterTerm('tag', params.name)],
    title: `Tag: ${params.name}`,
    crumbs: [{ label: params.name }],
    emptyText: `Nothing is tagged ${params.name}.`,
  });
  return buildListModel(db, spec, view);
}

/** Registers the section, subcategory, grouped, Unsorted, tag and collection pages. */
export function registerIndexRoutes(app: FastifyInstance, context: PageContext): void {
  const noParams = Type.Object({});
  for (const section of SECTIONS) {
    registerIndexPage(app, context, {
      url: `/${section}`,
      params: noParams,
      modelFor: (db, _params, view) => buildListModel(db, sectionSpec(section), view),
    });
  }
  registerIndexPage(app, context, {
    url: '/:section/:slug',
    params: Type.Object({ section: SectionParam, slug: Type.String({ minLength: 1 }) }),
    modelFor: subcategoryModel,
  });
  registerIndexPage(app, context, {
    url: '/:section/:slug/:group',
    params: Type.Object({ section: SectionParam, slug: Type.String(), group: Type.String() }),
    modelFor: groupPageModel,
  });
  registerIndexPage(app, context, { url: '/unsorted', params: noParams, modelFor: unsortedModel });
  registerIndexPage(app, context, {
    url: '/tags/:name',
    params: Type.Object({ name: Type.String({ minLength: 1 }) }),
    modelFor: tagModel,
  });
  registerIndexPage(app, context, {
    url: '/collections/:id',
    params: Type.Object({ id: Type.Integer({ minimum: 1 }) }),
    modelFor: collectionModel,
  });
}
