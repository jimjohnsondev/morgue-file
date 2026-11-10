// GET /search: the search results page (frame 4). The filter panel's form also lands here; its
// choices are folded into one canonical query and the browser is sent to that address.
import { Type } from '@sinclair/typebox';

import { canonicalOrder, queryToText } from '#core/query/canonical-query.js';
import { filterTerm, parseQuery } from '#core/query/parse-query.js';

import { SavedQuerystring } from '../page-status.js';
import { requireLibrary } from '../require-library.js';

import { searchHref } from './active-filters.js';
import { buildListModel } from './list-model.js';
import { ListViewQuerystring, toListView } from './list-view.js';
import { sendIndexPage } from './render-index.js';

import type { FilterKey, Query, Term } from '#core/query/query-types.js';
import type { PageContext } from '../page-context.js';
import type { ListSpec } from './list-model.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Static } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';

/** What the filter panel sends: the page's other terms as `base`, then each of its controls. */
const FilterForm = Type.Object({
  base: Type.Optional(Type.String()),
  words: Type.Optional(Type.String()),
  in: Type.Optional(Type.Array(Type.String())),
  sub: Type.Optional(Type.String()),
  tag: Type.Optional(Type.Array(Type.String())),
  model: Type.Optional(Type.String()),
  rating: Type.Optional(Type.String()),
  type: Type.Optional(Type.Array(Type.String())),
  collection: Type.Optional(Type.String()),
  group: Type.Optional(Type.String()),
});

const SearchQuerystring = Type.Composite([
  ListViewQuerystring,
  SavedQuerystring,
  FilterForm,
  Type.Object({ q: Type.Optional(Type.String()) }),
]);

type FilterFormValues = Static<typeof FilterForm>;

/** A choice the form sent, or undefined when it was left on "any". */
function chosen(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value;
}

/** The one value of a group of tick boxes, or undefined if none or several were ticked. */
function onlyOne(values: readonly string[] | undefined): string | undefined {
  return values?.length === 1 ? chosen(values[0]) : undefined;
}

/** The subcategory radio button's term; its last choice is Unsorted. */
function subcategoryTerm(sub: string): Term {
  return sub === 'unsorted' ? filterTerm('unsorted', '') : filterTerm('sub', sub);
}

/**
 * Turns the panel's choices into terms. v1 has no OR, so ticking more than one section or file
 * type means any of them, the same as ticking none.
 */
function formTerms(form: FilterFormValues): Term[] {
  const sub = chosen(form.sub);
  const picked: [FilterKey, string | undefined][] = [
    ['in', onlyOne(form.in)],
    ['type', onlyOne(form.type)],
    ['model', chosen(form.model)],
    ['rating', chosen(form.rating)],
    ['collection', chosen(form.collection)],
    ['group', chosen(form.group)],
  ];
  const terms = picked
    .filter((pick): pick is [FilterKey, string] => pick[1] !== undefined)
    .map(([key, value]) => filterTerm(key, value));
  const tags = (form.tag ?? []).map((tag) => filterTerm('tag', tag));
  return [...terms, ...tags, ...(sub === undefined ? [] : [subcategoryTerm(sub)])];
}

/** The search page's list: the query echoed in the title, results from every section. */
function searchSpec(query: Query): ListSpec {
  const text = queryToText(query);
  return {
    address: { path: '/search', q: text },
    query,
    title: text === '' ? 'Search' : 'Search:',
    ...(text !== '' && { echo: text }),
    breadcrumb: [{ label: 'Home', href: '/' }, { label: 'Search' }],
    section: undefined,
    isSearch: true,
    isShelf: false,
    emptyText: 'No items match.',
  };
}

/** The query a filter panel submission asks for: its base terms, its words, then its choices. */
export function foldFilterForm(form: FilterFormValues): Query {
  const base = parseQuery(form.base ?? '').terms;
  const words = parseQuery(form.words ?? '').terms;
  return { terms: canonicalOrder([...base, ...words, ...formTerms(form)]) };
}

/** Registers GET /search. */
export function registerSearchRoute(app: FastifyInstance, context: PageContext): void {
  app
    .withTypeProvider<TypeBoxTypeProvider>()
    .get('/search', { schema: { querystring: SearchQuerystring } }, async (request, reply) => {
      if (request.query.base !== undefined) {
        return reply.redirect(searchHref(foldFilterForm(request.query)), 303);
      }
      const { db } = requireLibrary(context.library);
      const spec = searchSpec(parseQuery(request.query.q ?? ''));
      const model = buildListModel(db, spec, toListView(request.query));
      const frame = {
        currentTab: '/search',
        searchText: spec.address.q ?? '',
        request: { url: request.url, savedId: request.query.saved },
      };
      return sendIndexPage(reply, { context, db, model, frame });
    });
}
