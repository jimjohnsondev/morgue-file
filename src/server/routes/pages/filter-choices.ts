// Builds the filter panel's lists from the library and marks what the page's query has chosen.
import {
  countUnsortedInSection,
  findAllTagNames,
  findModelNames,
  findSubcategoryCounts,
} from '#core/db/repositories/archive-counts.js';
import { findCollectionSummaries } from '#core/db/repositories/collections.js';
import { countItemsBySectionByQuery } from '#core/db/repositories/item-lists.js';
import { compileQuery } from '#core/query/compile-query.js';

import type { Db } from '#core/db/connection.js';
import type { Section } from '#core/db/repositories/items.js';
import type { FilterKey, Query } from '#core/query/query-types.js';
import type { FilterChoice } from '../../views/parts/filter-panel.js';

/** The sections in tab order, with the names the panel shows. */
export const SECTION_LABELS: Readonly<Record<Section, string>> = {
  photos: 'Photos',
  video: 'Video',
  library: 'Library',
};

/** The file types each section offers in the panel, as `type:` values and their labels. */
const TYPES_BY_SECTION: Readonly<Record<Section, readonly [string, string][]>> = {
  photos: [
    ['jpg', 'JPG'],
    ['png', 'PNG'],
    ['webp', 'WebP'],
    ['gif', 'GIF'],
  ],
  video: [
    ['mp4', 'MP4'],
    ['mov', 'MOV'],
  ],
  library: [
    ['pdf', 'PDF'],
    ['cbz', 'CBZ'],
    ['pagefolder', 'Page folder'],
  ],
};

const RATING_CHOICES: readonly [string, string][] = [
  ['3+', '3 or more'],
  ['4+', '4 or more'],
  ['5', '5 only'],
];

/** The values a query sets for one filter key, ignoring negated terms. */
export function chosenValues(query: Query, key: FilterKey): string[] {
  return query.terms
    .filter((term) => term.kind === 'filter' && term.key === key && !term.isNegated)
    .map((term) => term.value.toLowerCase());
}

/** The filters a panel has controls for: every filter on a section's page, fewer elsewhere. */
function panelKeys(hasSection: boolean): ReadonlySet<FilterKey> {
  const shared: FilterKey[] = ['in', 'tag', 'model', 'rating', 'collection'];
  return new Set(hasSection ? [...shared, 'sub', 'unsorted', 'type'] : shared);
}

/**
 * The query without the terms the panel sets: what the panel sends along as `base`. Fields,
 * words, negated filters and filters the panel has no control for (a `sub:` on the search
 * page) ride along, so Apply never drops them.
 */
export function withoutPanelTerms(query: Query, hasSection: boolean): Query {
  const keys = panelKeys(hasSection);
  return {
    terms: query.terms.filter(
      (term) => term.kind !== 'filter' || term.isNegated || !keys.has(term.key),
    ),
  };
}

/** Choices from value and label pairs, chosen where the query has the value. */
function choicesFrom(
  pairs: readonly [string, string][],
  chosen: readonly string[],
): FilterChoice[] {
  return pairs.map(([value, label]) => ({ value, label, isChosen: chosen.includes(value) }));
}

/** A section's subcategories as radio buttons with their counts, then its Unsorted. */
export function subcategoryChoices(db: Db, section: Section, query: Query): FilterChoice[] {
  const chosen = chosenValues(query, 'sub');
  const isUnsorted = chosenValues(query, 'unsorted').length > 0;
  const choices: FilterChoice[] = findSubcategoryCounts(db, section).map((subcategory) => ({
    value: subcategory.slug,
    label: subcategory.name,
    count: subcategory.itemCount,
    isChosen: chosen.includes(subcategory.slug),
  }));
  const unsorted = countUnsortedInSection(db, section);
  return [
    ...choices,
    { value: 'unsorted', label: 'Unsorted', count: unsorted, isChosen: isUnsorted },
  ];
}

/** The three sections as tick boxes, each counting what the query matches in it. */
export function sectionChoices(db: Db, query: Query): FilterChoice[] {
  const anySection = {
    terms: query.terms.filter((term) => !(term.kind === 'filter' && term.key === 'in')),
  };
  const counts = countItemsBySectionByQuery(db, compileQuery(anySection));
  const chosen = chosenValues(query, 'in');
  return Object.entries(SECTION_LABELS).map(([section, label]) => ({
    value: section,
    label,
    count: counts.get(section as Section) ?? 0,
    // No section chosen means all of them, so every box starts ticked.
    isChosen: chosen.length === 0 || chosen.includes(section),
  }));
}

/** Every tag, every model, the ratings and every collection, as the query has chosen them. */
export function sharedChoices(db: Db, query: Query) {
  const tags = chosenValues(query, 'tag');
  const modelPrefixes = chosenValues(query, 'model');
  const collections = chosenValues(query, 'collection');
  return {
    tags: findAllTagNames(db).map((name) => ({
      value: name,
      label: name,
      isChosen: tags.includes(name.toLowerCase()),
    })),
    models: findModelNames(db).map((model) => ({
      value: model.name,
      label: model.name,
      isChosen: modelPrefixes.some((prefix) => model.name.toLowerCase().startsWith(prefix)),
    })),
    ratings: choicesFrom(RATING_CHOICES, chosenValues(query, 'rating')),
    collections: findCollectionSummaries(db).map((collection) => ({
      value: collection.name,
      label: collection.name,
      isChosen:
        collections.includes(collection.name.toLowerCase()) ||
        collections.includes(String(collection.id)),
    })),
  };
}

/** The file types a section offers, as tick boxes. */
export function typeChoices(section: Section, query: Query): FilterChoice[] {
  return choicesFrom(TYPES_BY_SECTION[section], chosenValues(query, 'type'));
}
