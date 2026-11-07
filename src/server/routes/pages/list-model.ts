// Reads one page of a list from the library and lays it out for the Index template: the cards,
// the counts in the caption, the pager, the toolbar and the filter panel.
import {
  countItemsByQuery,
  countItemsBySectionByQuery,
  findItemsByQuery,
} from '#core/db/repositories/item-lists.js';
import { queryToText } from '#core/query/canonical-query.js';
import { compileQuery } from '#core/query/compile-query.js';

import { countLabel } from '../../views/templates/index-template.js';

import {
  activeFilters,
  matchedModelLinks,
  noResultsHelp,
  searchCaption,
} from './active-filters.js';
import {
  sectionChoices,
  sharedChoices,
  subcategoryChoices,
  typeChoices,
  withoutPanelTerms,
} from './filter-choices.js';
import { listHref, PER_PAGE_CHOICES, SIZE_CHOICES } from './list-view.js';
import { selectionParts } from './selection-model.js';
import { toThumbCards } from './thumb-cards.js';

import type { Db } from '#core/db/connection.js';
import type { Section } from '#core/db/repositories/items.js';
import type { CompiledQuery } from '#core/query/compile-query.js';
import type { Query } from '#core/query/query-types.js';
import type { ListAddress, ListView } from './list-view.js';
import type { Crumb } from '../../views/parts/breadcrumb.js';
import type { FilterPanelModel } from '../../views/parts/filter-panel.js';
import type { EmptyHelp, IndexModel, ToolbarModel } from '../../views/templates/index-template.js';

/** What a route says about its list; the rest is read from the library. */
export type ListSpec = {
  readonly address: ListAddress;
  readonly query: Query;
  readonly title: string;
  readonly echo?: string;
  readonly breadcrumb: readonly Crumb[];
  /** The section the page belongs to, if it lists only one. */
  readonly section: Section | undefined;
  /** Search results get "results" captions, section boxes and filter chips (frame 4). */
  readonly isSearch: boolean;
  /** Library shelves of covers open with the filter panel folded (frame 2). */
  readonly isShelf: boolean;
  readonly emptyText: string;
  readonly emptyHelp?: EmptyHelp;
  /** The collection a collection's page lists, whose items its action panel can take out. */
  readonly collection?: { readonly id: number; readonly name: string };
};

/** The size and per-page links, each keeping the rest of the view. */
function toolbarFor(address: ListAddress, view: ListView): ToolbarModel {
  return {
    sizes: SIZE_CHOICES.map((size) => ({
      label: size.charAt(0).toUpperCase() + size.slice(1),
      href: listHref(address, view, { size, page: 1 }),
      isCurrent: size === view.size,
    })),
    perPage: PER_PAGE_CHOICES.map((perPage) => ({
      label: String(perPage),
      href: listHref(address, view, { perPage, page: 1 }),
      isCurrent: perPage === view.perPage,
    })),
  };
}

/** The filter panel for a list, with its lists filled in from the library. */
function filterPanelFor(db: Db, spec: ListSpec, view: ListView): FilterPanelModel {
  const { section, query } = spec;
  return {
    baseQuery: queryToText(withoutPanelTerms(query, section !== undefined)),
    fixedSection: section,
    resetHref: spec.address.q === undefined ? spec.address.path : '/search',
    hideHref: listHref(spec.address, view, { filters: 'hidden' }),
    searchLabel: section === undefined ? 'Search within these' : `Search within ${spec.title}`,
    subcategories: section === undefined ? undefined : subcategoryChoices(db, section, query),
    sections: section === undefined ? sectionChoices(db, query) : undefined,
    types: section === undefined ? undefined : typeChoices(section, query),
    ...sharedChoices(db, query),
  };
}

/** The caption beside the title: "1,236 items · showing 193–288 · page 3 of 13". */
function listCaption(total: number, page: number, view: ListView): string {
  const lastPage = Math.max(1, Math.ceil(total / view.perPage));
  if (total === 0) {
    return 'no items';
  }
  const first = (page - 1) * view.perPage + 1;
  const last = Math.min(total, page * view.perPage);
  return `${countLabel(total, 'item')} · showing ${first.toLocaleString('en-US')}–${last.toLocaleString('en-US')} · page ${String(page)} of ${String(lastPage)}`;
}

/** Adds up the counts in a map. */
function sumOf(counts: ReadonlyMap<unknown, number>): number {
  let sum = 0;
  for (const count of counts.values()) {
    sum += count;
  }
  return sum;
}

/** The list's counts and the lines that show them: the caption and the grid panel's title. */
type ListCounts = {
  readonly total: number;
  readonly page: number;
  readonly lastPage: number;
  readonly caption: string;
  readonly panelTitle: string;
};

/**
 * Counts what the query matches. Search pages count per section for their caption ("34 in
 * Photos, 4 in Library"), and their total is the sum, so the items are counted once.
 */
function countList(
  db: Db,
  list: { readonly spec: ListSpec; readonly compiled: CompiledQuery; readonly view: ListView },
): ListCounts {
  const { spec, compiled, view } = list;
  if (!spec.isSearch) {
    const total = countItemsByQuery(db, compiled);
    const lastPage = Math.max(1, Math.ceil(total / view.perPage));
    const page = Math.min(view.page, lastPage);
    const caption = listCaption(total, page, view);
    return { total, page, lastPage, caption, panelTitle: `Browse · ${countLabel(total, 'item')}` };
  }
  const bySection = countItemsBySectionByQuery(db, compiled);
  const total = sumOf(bySection);
  const lastPage = Math.max(1, Math.ceil(total / view.perPage));
  const page = Math.min(view.page, lastPage);
  return {
    total,
    page,
    lastPage,
    caption: searchCaption({ bySection, total, page, lastPage }),
    panelTitle: `Results · ${total.toLocaleString('en-US')}`,
  };
}

/**
 * Whether the filter panel shows, and where "» show filters" goes when it doesn't. Selection mode
 * puts the action panel in its place (frame 13), and showing filters leaves selection mode.
 */
function filterPlace(spec: ListSpec, view: ListView, isSelecting: boolean) {
  const isPanelOpen =
    !isSelecting && (view.filters === undefined ? !spec.isShelf : view.filters === 'shown');
  const showFiltersHref = isPanelOpen
    ? undefined
    : listHref(spec.address, view, { filters: 'shown', isSelecting: false });
  return { isPanelOpen, showFiltersHref };
}

/** Reads the page of the list the view asks for and builds everything the template shows. */
export function buildListModel(db: Db, spec: ListSpec, view: ListView): IndexModel {
  const compiled = compileQuery(spec.query);
  const counts = countList(db, { spec, compiled, view });
  const { page, lastPage } = counts;
  const items = findItemsByQuery(db, compiled, {
    limit: view.perPage,
    offset: (page - 1) * view.perPage,
  });
  const selection = selectionParts(db, {
    spec,
    view,
    total: counts.total,
    cards: toThumbCards(items, {
      size: view.size,
      fromQuery: queryToText(spec.query),
      caption: spec.isSearch ? 'where' : 'details',
    }),
  });
  const { isPanelOpen, showFiltersHref } = filterPlace(spec, view, selection.panel !== undefined);
  return {
    title: spec.title,
    ...(spec.echo !== undefined && { echo: spec.echo }),
    breadcrumb: spec.breadcrumb,
    caption: counts.caption,
    panelTitle: counts.panelTitle,
    size: view.size,
    groups: [{ cards: selection.cards }],
    emptyText: spec.emptyText,
    emptyHelp: spec.isSearch ? noResultsHelp(spec.query) : spec.emptyHelp,
    toolbar: { ...toolbarFor(spec.address, view), selectHref: selection.selectHref },
    paging: { page, lastPage, hrefFor: (target) => listHref(spec.address, view, { page: target }) },
    filterPanel: isPanelOpen ? filterPanelFor(db, spec, view) : undefined,
    showFiltersHref,
    activeFilters: spec.isSearch ? activeFilters(db, spec.query) : undefined,
    matchedModels: spec.isSearch ? matchedModelLinks(db, spec.query) : undefined,
    selection: selection.panel,
  };
}
