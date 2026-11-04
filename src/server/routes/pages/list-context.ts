// The list an Item page steps through (R19): the Index it was opened from, the item's place in
// it ("3 of 1,236 in Figure") and the items either side for Prev, Next and the arrow keys.
import { findCollectionSummaries } from '#core/db/repositories/collections.js';
import { findItemsInFieldGroup } from '#core/db/repositories/field-groups.js';
import { countItemsByQuery, findListPlace } from '#core/db/repositories/item-lists.js';
import { findSubcategoryBySlug } from '#core/db/repositories/subcategories.js';
import { AppError } from '#core/errors.js';
import { queryToText } from '#core/query/canonical-query.js';
import { compileQuery } from '#core/query/compile-query.js';

import { searchHref } from './active-filters.js';
import { SECTION_LABELS } from './filter-choices.js';
import { groupSpecFor, groupValuePath, groupValueQuery, subcategoryPath } from './group-model.js';

import type { Db } from '#core/db/connection.js';
import type { GroupSpec } from '#core/db/repositories/field-groups.js';
import type { ListPlace } from '#core/db/repositories/item-lists.js';
import type { Section } from '#core/db/repositories/items.js';
import type { Subcategory } from '#core/db/repositories/subcategories.js';
import type { Query, Term } from '#core/query/query-types.js';

/** Where an item sits in the list it was opened from, and how to name and link that list. */
export type ListContext = ListPlace & {
  readonly total: number;
  /** The list's name after "3 of 1,236 in": Figure, Life Drawing Quarterly, search results. */
  readonly label: string;
  readonly href: string;
  /** The canonical query, which Prev and Next carry on. */
  readonly fromQuery: string;
};

/** How a list is named and where it lives. */
type ListName = { readonly label: string; readonly href: string };

/** The value of a list's one filter with this key, if the list has it. */
function filterValue(terms: readonly Term[], key: string): string | undefined {
  return terms.find((term) => term.kind === 'filter' && term.key === key)?.value;
}

/** The section a list's `in:` names, if it names a real one. */
function sectionOf(terms: readonly Term[]): Section | undefined {
  const value = filterValue(terms, 'in');
  return value !== undefined && Object.hasOwn(SECTION_LABELS, value)
    ? (value as Section)
    : undefined;
}

/** Says whether a list's terms are exactly these filters, in this order, none negated. */
function hasExactly(terms: readonly Term[], keys: readonly string[]): boolean {
  return (
    terms.length === keys.length &&
    terms.every(
      (term, index) => term.kind === 'filter' && !term.isNegated && term.key === keys[index],
    )
  );
}

/** A section or subcategory page's name: Photos, or Figure. */
function nameSectionList(db: Db, terms: readonly Term[]): ListName | undefined {
  const section = sectionOf(terms);
  if (section === undefined) {
    return undefined;
  }
  if (hasExactly(terms, ['in'])) {
    return { label: SECTION_LABELS[section], href: `/${section}` };
  }
  const subcategory = hasExactly(terms, ['in', 'sub'])
    ? findSubcategoryBySlug(db, section, filterValue(terms, 'sub') ?? '')
    : undefined;
  return subcategory === undefined
    ? undefined
    : { label: subcategory.name, href: subcategoryPath(subcategory) };
}

/** A tag page's name: "tag hands". */
function nameTagList(terms: readonly Term[]): ListName | undefined {
  const tag = filterValue(terms, 'tag');
  if (tag === undefined || !hasExactly(terms, ['tag'])) {
    return undefined;
  }
  return { label: `tag ${tag}`, href: `/tags/${encodeURIComponent(tag)}` };
}

/** A collection page's name, for a list of one collection by id. */
function nameCollectionList(db: Db, terms: readonly Term[]): ListName | undefined {
  const collectionId = filterValue(terms, 'collection');
  if (collectionId === undefined || !hasExactly(terms, ['collection'])) {
    return undefined;
  }
  const collection = findCollectionSummaries(db).find(
    (summary) => String(summary.id) === collectionId,
  );
  return collection === undefined
    ? undefined
    : { label: collection.name, href: `/collections/${String(collection.id)}` };
}

/** An Unsorted, tag or collection page's name. */
function nameCrossSectionList(db: Db, terms: readonly Term[]): ListName | undefined {
  if (hasExactly(terms, ['unsorted'])) {
    return { label: 'Unsorted', href: '/unsorted' };
  }
  return nameTagList(terms) ?? nameCollectionList(db, terms);
}

/** A list page's name and address; any list without a page of its own is a search. */
function nameList(db: Db, query: Query): ListName {
  return (
    nameSectionList(db, query.terms) ??
    nameCrossSectionList(db, query.terms) ?? { label: 'search results', href: searchHref(query) }
  );
}

/** One grouped value a list shows: a magazine title's issues. */
type GroupedValue = {
  readonly subcategory: Subcategory;
  readonly spec: GroupSpec;
  readonly value: string;
};

/** The parts of a grouped value's page query: `in:x sub:y key:value`. */
type GroupShape = {
  readonly section: Section;
  readonly slug: string;
  readonly fieldTerm: Extract<Term, { kind: 'field' }>;
};

/** Reads a query shaped like a grouped value's page into its parts, if it is one. */
function groupShapeOf(terms: readonly Term[]): GroupShape | undefined {
  const [, , fieldTerm] = terms;
  const section = sectionOf(terms);
  if (terms.length !== 3 || !hasExactly(terms.slice(0, 2), ['in', 'sub'])) {
    return undefined;
  }
  if (section === undefined || fieldTerm?.kind !== 'field' || fieldTerm.isNegated) {
    return undefined;
  }
  return { section, slug: filterValue(terms, 'sub') ?? '', fieldTerm };
}

/**
 * The grouped value a query lists, if it is one grouped value's page (frame 3):
 * `in:library sub:magazines magazine_title:"Life Drawing Quarterly"`.
 */
function groupedValueOf(db: Db, query: Query): GroupedValue | undefined {
  const shape = groupShapeOf(query.terms);
  const subcategory =
    shape === undefined ? undefined : findSubcategoryBySlug(db, shape.section, shape.slug);
  const spec = subcategory === undefined ? undefined : groupSpecFor(db, subcategory);
  if (shape === undefined || subcategory === undefined || spec === undefined) {
    return undefined;
  }
  return spec.groupFieldKey === shape.fieldTerm.key
    ? { subcategory, spec, value: shape.fieldTerm.value }
    : undefined;
}

/**
 * An item's place in one grouped value's page, which lists issues newest first rather than in
 * the usual order, so Prev and Next follow what the page showed.
 */
function findGroupContext(db: Db, group: GroupedValue, itemId: number): ListContext | undefined {
  const ids = findItemsInFieldGroup(db, group.spec, group.value).map((listed) => listed.id);
  const index = ids.indexOf(itemId);
  if (index === -1) {
    return undefined;
  }
  const query = groupValueQuery(group.subcategory, group.spec, group.value);
  return {
    position: index + 1,
    total: ids.length,
    previousId: ids[index - 1],
    nextId: ids[index + 1],
    label: group.value,
    href: groupValuePath(group.subcategory, group.value),
    fromQuery: queryToText(query),
  };
}

/**
 * Finds an item's place in the list a query names, or undefined if the list doesn't hold it (an
 * old link, or a query that no longer matches). A query that can't be compiled, such as a bad
 * rating, also gives no list, so the item page still opens.
 */
export function findListContext(db: Db, query: Query, itemId: number): ListContext | undefined {
  const group = groupedValueOf(db, query);
  if (group !== undefined) {
    return findGroupContext(db, group, itemId);
  }
  let compiled;
  try {
    compiled = compileQuery(query);
  } catch (error) {
    if (error instanceof AppError) {
      return undefined;
    }
    throw error;
  }
  const place = findListPlace(db, compiled, itemId);
  if (place === undefined) {
    return undefined;
  }
  return {
    ...place,
    total: countItemsByQuery(db, compiled),
    ...nameList(db, query),
    fromQuery: queryToText(query),
  };
}
