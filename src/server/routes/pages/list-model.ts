// Reads one page of a list from the library and lays it out for the Index template: the cards,
// the counts in the caption, the pager, the toolbar and the filter panel.
import { countItemsByQuery, findItemsByQuery } from '#core/db/repositories/item-lists.js';
import { queryToText } from '#core/query/canonical-query.js';
import { compileQuery } from '#core/query/compile-query.js';

import { countLabel } from '../../views/templates/index-template.js';

import { activeFilters, searchCaption } from './active-filters.js';
import {
  sectionChoices,
  sharedChoices,
  subcategoryChoices,
  typeChoices,
  withoutPanelTerms,
} from './filter-choices.js';
import { listHref, PER_PAGE_CHOICES, SIZE_CHOICES } from './list-view.js';
import { toThumbCards } from './thumb-cards.js';

import type { Db } from '#core/db/connection.js';
import type { Section } from '#core/db/repositories/items.js';
import type { Query } from '#core/query/query-types.js';
import type { ListAddress, ListView } from './list-view.js';
import type { Crumb } from '../../views/parts/breadcrumb.js';
import type { FilterPanelModel } from '../../views/parts/filter-panel.js';
import type { IndexModel, ToolbarModel } from '../../views/templates/index-template.js';

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

/** Reads the page of the list the view asks for and builds everything the template shows. */
export function buildListModel(db: Db, spec: ListSpec, view: ListView): IndexModel {
  const compiled = compileQuery(spec.query);
  const total = countItemsByQuery(db, compiled);
  const lastPage = Math.max(1, Math.ceil(total / view.perPage));
  const page = Math.min(view.page, lastPage);
  const items = findItemsByQuery(db, compiled, {
    limit: view.perPage,
    offset: (page - 1) * view.perPage,
  });
  const fromQuery = queryToText(spec.query);
  const cards = toThumbCards(items, {
    size: view.size,
    fromQuery,
    caption: spec.isSearch ? 'where' : 'details',
  });
  const isPanelOpen = view.filters === undefined ? !spec.isShelf : view.filters === 'shown';
  return {
    title: spec.title,
    ...(spec.echo !== undefined && { echo: spec.echo }),
    breadcrumb: spec.breadcrumb,
    caption: spec.isSearch
      ? searchCaption(db, spec.query, { total, page, lastPage })
      : listCaption(total, page, view),
    panelTitle: spec.isSearch
      ? `Results · ${total.toLocaleString('en-US')}`
      : `Browse · ${countLabel(total, 'item')}`,
    size: view.size,
    groups: [{ cards }],
    emptyText: spec.emptyText,
    toolbar: toolbarFor(spec.address, view),
    paging: { page, lastPage, hrefFor: (target) => listHref(spec.address, view, { page: target }) },
    filterPanel: isPanelOpen ? filterPanelFor(db, spec, view) : undefined,
    showFiltersHref: isPanelOpen ? undefined : listHref(spec.address, view, { filters: 'shown' }),
    activeFilters: spec.isSearch ? activeFilters(db, spec.query) : undefined,
  };
}
