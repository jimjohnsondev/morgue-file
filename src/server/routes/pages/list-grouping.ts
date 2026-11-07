// Group-by on any Index page (R13): which groupings a list offers, the one its `group:` term
// asks for, and its page of cards split under one heading per group.
import { findFieldsByEntity } from '#core/db/repositories/fields.js';
import { countItemsByGroupByQuery } from '#core/db/repositories/item-lists.js';
import { findAllSubcategories } from '#core/db/repositories/subcategories.js';
import { compileQuery } from '#core/query/compile-query.js';

import { formatCount } from '../../views/format.js';
import { countLabel } from '../../views/templates/index-template.js';

import { chosenValues } from './filter-choices.js';
import { itemPlace } from './thumb-cards.js';

import type { Db } from '#core/db/connection.js';
import type { Field } from '#core/db/repositories/fields.js';
import type { GroupedItem } from '#core/db/repositories/item-lists.js';
import type { CompiledQuery } from '#core/query/compile-query.js';
import type { Grouping } from '#core/query/group-order.js';
import type { Query } from '#core/query/query-types.js';
import type { FilterChoice } from '../../views/parts/filter-panel.js';
import type { ThumbCard } from '../../views/parts/thumb-grid.js';
import type { CardGroup } from '../../views/templates/index-template.js';

/** The `group:` value that gathers a list by subcategory. */
const BY_SUBCATEGORY = 'subcategory';

/** How each kind of field orders its groups; long text and links have no groups to speak of. */
const ORDER_BY_TYPE: Readonly<Partial<Record<Field['type'], 'text' | 'number' | 'year'>>> = {
  text: 'text',
  picklist: 'text',
  number: 'number',
  date: 'year',
};

/** A grouping the list asked for, with the name its headings use. */
export type NamedGrouping = { readonly grouping: Grouping; readonly label: string };

/** The ids of the subcategories a query's `sub:` terms name, in any section. */
function chosenSubcategoryIds(db: Db, query: Query): Set<number> {
  const slugs = chosenValues(query, 'sub');
  return new Set(
    findAllSubcategories(db)
      .filter((subcategory) => slugs.includes(subcategory.slug))
      .map((subcategory) => subcategory.id),
  );
}

/**
 * The item fields a list can be grouped by: every field with groupable values that every item
 * has, and those of a subcategory the list keeps to (Magazines' title and issue date).
 */
function groupableFields(db: Db, query: Query): Field[] {
  const subcategoryIds = chosenSubcategoryIds(db, query);
  return findFieldsByEntity(db, 'item').filter(
    (field) =>
      field.removedAt === undefined &&
      ORDER_BY_TYPE[field.type] !== undefined &&
      (field.scopeSubcategoryId === undefined || subcategoryIds.has(field.scopeSubcategoryId)),
  );
}

/** Says whether a list keeps to one subcategory or Unsorted, so grouping by it says nothing. */
function isWithinSubcategory(query: Query): boolean {
  return chosenValues(query, 'sub').length > 0 || chosenValues(query, 'unsorted').length > 0;
}

/** The grouping a query's last `group:` term names, if the list can be grouped that way. */
export function namedGroupingOf(db: Db, query: Query): NamedGrouping | undefined {
  const key = chosenValues(query, 'group').at(-1);
  if (key === BY_SUBCATEGORY) {
    return isWithinSubcategory(query)
      ? undefined
      : { grouping: { kind: 'subcategory' }, label: 'Subcategory' };
  }
  const field = groupableFields(db, query).find((candidate) => candidate.key === key);
  const order = field === undefined ? undefined : ORDER_BY_TYPE[field.type];
  return field === undefined || order === undefined
    ? undefined
    : { grouping: { kind: 'field', key: field.key, order }, label: field.label };
}

/** Compiles a list's query with the grouping it asks for, so its order follows its groups. */
export function compileListQuery(db: Db, query: Query): CompiledQuery {
  return compileQuery(query, namedGroupingOf(db, query)?.grouping);
}

/** The Group by list's choices: Subcategory where the list spans several, then each field. */
export function groupChoices(
  db: Db,
  query: Query,
  named: NamedGrouping | undefined,
): FilterChoice[] {
  const chosenValue = named?.grouping.kind === 'field' ? named.grouping.key : BY_SUBCATEGORY;
  const offered = groupableFields(db, query).map((field) => [field.key, field.label] as const);
  const all = isWithinSubcategory(query)
    ? offered
    : [[BY_SUBCATEGORY, 'Subcategory'] as const, ...offered];
  return all.map(([value, label]) => ({
    value,
    label,
    isChosen: named !== undefined && chosenValue === value,
  }));
}

/** A group's heading: "Rating: 4", "Magazine: Life Drawing Quarterly", "No rating". */
function groupHeading(named: NamedGrouping, first: GroupedItem): string {
  if (named.grouping.kind === 'subcategory') {
    return itemPlace(first);
  }
  const { groupValue } = first;
  if (groupValue === undefined) {
    return `No ${named.label.toLowerCase()}`;
  }
  const value = typeof groupValue === 'number' ? formatCount(groupValue) : groupValue;
  return `${named.label}: ${value}`;
}

/**
 * Splits a page of cards under one heading per group, each captioned with how many items the
 * whole group holds, since a group can run on over several pages. A list that isn't grouped
 * is one group with no heading. The cards are the items' own, in the same order.
 */
export function groupCards(
  db: Db,
  list: {
    readonly named: NamedGrouping | undefined;
    readonly compiled: CompiledQuery;
    readonly items: readonly GroupedItem[];
    readonly cards: readonly ThumbCard[];
  },
): CardGroup[] {
  const { named } = list;
  if (named === undefined) {
    return [{ cards: list.cards }];
  }
  const counts = countItemsByGroupByQuery(db, list.compiled);
  const runs: { first: GroupedItem; cards: ThumbCard[] }[] = [];
  for (const [index, item] of list.items.entries()) {
    const card = list.cards[index];
    if (card === undefined) {
      continue;
    }
    const current = runs.at(-1);
    if (current !== undefined && current.first.groupValue === item.groupValue) {
      current.cards.push(card);
    } else {
      runs.push({ first: item, cards: [card] });
    }
  }
  return runs.map((run) => ({
    heading: groupHeading(named, run.first),
    caption: countLabel(counts.get(run.first.groupValue) ?? 0, 'item'),
    cards: run.cards,
  }));
}
