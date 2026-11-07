// The search page's echo of its query: the caption with counts per section, one removable chip
// per term, whose [x] link is the query without that term (frame 4, E2), and the models its
// words found.
import { findModelNames } from '#core/db/repositories/archive-counts.js';
import { findModelsByText } from '#core/db/repositories/search-rows.js';
import { queryToText, termToText, withoutTerm } from '#core/query/canonical-query.js';
import { textMatch } from '#core/query/text-match.js';

import { formatCount } from '../../views/format.js';
import { countLabel } from '../../views/templates/index-template.js';

import { SECTION_LABELS } from './filter-choices.js';

import type { Db } from '#core/db/connection.js';
import type { Section } from '#core/db/repositories/items.js';
import type { Query, Term } from '#core/query/query-types.js';
import type { ActiveFilter, EmptyHelp, TextLink } from '../../views/templates/index-template.js';

/** How many models the line above a search's items names at most. */
const MATCHED_MODEL_LIMIT = 12;

/** The search page for a query. */
export function searchHref(query: Query): string {
  const text = queryToText(query);
  return text === '' ? '/search' : `/search?${new URLSearchParams({ q: text }).toString()}`;
}

/** The name `model:` matched, when exactly one model's name starts with it ("Elena Varga"). */
function modelName(db: Db, prefix: string): string {
  const matches = findModelNames(db).filter((model) =>
    model.name.toLowerCase().startsWith(prefix.toLowerCase()),
  );
  return matches.length === 1 && matches[0] !== undefined ? matches[0].name : prefix;
}

/** How a term reads on its chip: "tag: hands", "model: Elena Varga", "not type: gif". */
function chipLabel(db: Db, term: Term): string {
  const sign = term.isNegated ? 'not ' : '';
  switch (term.kind) {
    case 'filter':
      if (term.key === 'unsorted') {
        return `${sign}unsorted`;
      }
      return `${sign}${term.key}: ${term.key === 'model' ? modelName(db, term.value) : term.value}`;
    case 'field':
      return `${sign}${term.key}: ${term.value}`;
    case 'phrase':
      return `${sign}"${term.value}"`;
    case 'word':
      return `${sign}${term.value}`;
  }
}

/** One chip per term of the query, and the link that clears them all. */
export function activeFilters(
  db: Db,
  query: Query,
): { filters: ActiveFilter[]; clearHref: string } | undefined {
  if (query.terms.length === 0) {
    return undefined;
  }
  const filters = query.terms.map((term, index) => ({
    label: chipLabel(db, term),
    removeHref: searchHref(withoutTerm(query, index)),
  }));
  return { filters, clearHref: '/search' };
}

/**
 * The models whose fields or tags match the search's words and phrases, linking to their
 * profiles (docs/ARCHITECTURE.md, Search). A search without free text lists none.
 */
export function matchedModelLinks(db: Db, query: Query): TextLink[] {
  const { match, excluded } = textMatch(query);
  if (match === undefined) {
    return [];
  }
  return findModelsByText(db, { match, excluded, limit: MATCHED_MODEL_LIMIT }).map((model) => ({
    label: model.name,
    href: `/models/${encodeURIComponent(model.slug)}`,
  }));
}

/** Where E2's "search tips" link goes: the query language, written out. */
export const SEARCH_TIPS_PATH = '/search/tips';

/**
 * What a search that found nothing offers (E2): the search again without each term in turn,
 * then ways to start over or learn the query language. A search with one term has nothing to
 * drop but that term. `group:` terms only order the list, so dropping one would find nothing
 * more and isn't offered.
 */
export function noResultsHelp(query: Query): EmptyHelp | undefined {
  if (query.terms.length === 0) {
    return undefined;
  }
  const without = query.terms.flatMap((term, index) =>
    term.kind === 'filter' && term.key === 'group'
      ? []
      : [{ term: termToText(term), href: searchHref(withoutTerm(query, index)) }],
  );
  return {
    without,
    links: [
      { label: 'Clear the search', href: '/search' },
      { label: 'search tips', href: SEARCH_TIPS_PATH },
    ],
  };
}

/** "38 results · 34 in Photos, 4 in Library · page 1 of 1". */
export function searchCaption(counts: {
  readonly bySection: ReadonlyMap<Section, number>;
  readonly total: number;
  readonly page: number;
  readonly lastPage: number;
}): string {
  const { bySection } = counts;
  const sections = (Object.keys(SECTION_LABELS) as Section[])
    .filter((section) => (bySection.get(section) ?? 0) > 0)
    .map((section) => `${formatCount(bySection.get(section) ?? 0)} in ${SECTION_LABELS[section]}`);
  const parts = [countLabel(counts.total, 'result')];
  if (sections.length > 0) {
    parts.push(sections.join(', '));
  }
  parts.push(`page ${String(counts.page)} of ${String(counts.lastPage)}`);
  return parts.join(' · ');
}
