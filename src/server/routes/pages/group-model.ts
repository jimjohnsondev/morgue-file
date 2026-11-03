// Group-by for Index pages (R13, minimal): a subcategory with a group_by field lists one card per
// value (Magazines: one per title), and each value's page lists its items by year of their date
// field, newest first (frame 3).
import { findFieldGroups, findItemsInFieldGroup } from '#core/db/repositories/field-groups.js';
import { findFieldsByEntity } from '#core/db/repositories/fields.js';
import { AppError } from '#core/errors.js';
import { queryToText } from '#core/query/canonical-query.js';
import { parseQuery } from '#core/query/parse-query.js';
import { slugify } from '#core/slug.js';

import { countLabel } from '../../views/templates/index-template.js';

import { searchHref } from './active-filters.js';
import { SECTION_LABELS } from './filter-choices.js';
import { thumbnailSrc, toThumbCards } from './thumb-cards.js';

import type { Db } from '#core/db/connection.js';
import type { DatedItem, FieldGroup, GroupSpec } from '#core/db/repositories/field-groups.js';
import type { Subcategory } from '#core/db/repositories/subcategories.js';
import type { Crumb } from '../../views/parts/breadcrumb.js';
import type { CardGroup, IndexModel } from '../../views/templates/index-template.js';

/** Months that start each season: Dec–Feb Winter, Mar–May Spring, Jun–Aug Summer, Sep–Nov Fall. */
const SEASONS = [
  'Winter',
  'Winter',
  'Spring',
  'Spring',
  'Spring',
  'Summer',
  'Summer',
  'Summer',
  'Fall',
  'Fall',
  'Fall',
  'Winter',
];

/** Reads which field a subcategory groups by, and the date field its groups are ordered by. */
export function groupSpecFor(db: Db, subcategory: Subcategory): GroupSpec | undefined {
  if (subcategory.groupBy === undefined) {
    return undefined;
  }
  const { field } = JSON.parse(subcategory.groupBy) as { field: string };
  const dateField = findFieldsByEntity(db, 'item').find(
    (candidate) => candidate.type === 'date' && candidate.scopeSubcategoryId === subcategory.id,
  );
  return {
    subcategoryId: subcategory.id,
    groupFieldKey: field,
    dateFieldKey: dateField?.key ?? '',
  };
}

/** "Winter 2023", from an ISO date. */
function seasonOf(date: string): string {
  const month = Number(date.slice(5, 7));
  return `${SEASONS[month - 1] ?? ''} ${date.slice(0, 4)}`.trim();
}

/** An issue's caption: its name without the title it shares ("No. 12"), then its season. */
function issueLabel(item: DatedItem, title: string): string {
  const name = (item.relPath.split('/').at(-1) ?? '').replace(/\.(pdf|cbz)$/i, '');
  const short = name.startsWith(title) ? name.slice(title.length).trim() : name;
  return item.date === undefined ? short : `${short} · ${seasonOf(item.date)}`;
}

/** Home › Library, the start of both grouped pages' breadcrumbs. */
function subcategoryCrumbs(subcategory: Subcategory): Crumb[] {
  const { section } = subcategory;
  return [
    { label: 'Home', href: '/' },
    { label: SECTION_LABELS[section], href: `/${section}` },
  ];
}

/** The common frame of both grouped pages. */
function groupedModel(
  parts: Pick<IndexModel, 'title' | 'breadcrumb' | 'caption' | 'panelTitle' | 'groups'> & {
    readonly showFiltersHref: string;
    readonly toolbarNote: string;
  },
): IndexModel {
  const { toolbarNote, ...shown } = parts;
  return {
    ...shown,
    size: 'medium',
    emptyText: 'Nothing here yet.',
    toolbar: { sizes: undefined, perPage: undefined, note: toolbarNote },
    paging: undefined,
    filterPanel: undefined,
    activeFilters: undefined,
  };
}

/** The page listing a grouped subcategory's values: one cover per magazine title. */
export function buildGroupListModel(db: Db, subcategory: Subcategory, spec: GroupSpec): IndexModel {
  const groups = findFieldGroups(db, spec);
  const path = `/${subcategory.section}/${subcategory.slug}`;
  let itemCount = 0;
  for (const group of groups) {
    itemCount += group.itemCount;
  }
  const cards = groups.map((group: FieldGroup) => ({
    key: group.value,
    href: `${path}/${encodeURIComponent(slugify(group.value))}`,
    imageSrc: thumbnailSrc(
      { id: group.coverItemId, kind: 'pdf', mtimeMs: group.coverMtimeMs },
      'medium',
    ),
    shape: 'cover' as const,
    label: group.value,
    details: countLabel(group.itemCount, 'issue'),
  }));
  return groupedModel({
    title: subcategory.name,
    breadcrumb: [...subcategoryCrumbs(subcategory), { label: subcategory.name }],
    caption: `${countLabel(itemCount, 'issue')} across ${countLabel(groups.length, 'title')}`,
    panelTitle: `Titles · ${String(groups.length)}`,
    toolbarNote: 'Group by: Title · Order: A to Z',
    groups: [{ cards }],
    showFiltersHref: searchHref(parseQuery(`in:${subcategory.section} sub:${subcategory.slug}`)),
  });
}

/** Gathers dated items by year, keeping their newest-first order; undated ones go last. */
function byYear(items: readonly DatedItem[]): Map<string, DatedItem[]> {
  const years = new Map<string, DatedItem[]>();
  for (const item of items) {
    const year = item.date?.slice(0, 4) ?? 'Undated';
    years.set(year, [...(years.get(year) ?? []), item]);
  }
  return years;
}

/** The year groups of one value's page, each card captioned with its issue and season. */
function yearGroups(items: readonly DatedItem[], title: string, fromQuery: string): CardGroup[] {
  return [...byYear(items)].map(([year, issues]) => ({
    heading: year,
    caption: countLabel(issues.length, 'issue'),
    cards: toThumbCards(issues, {
      size: 'medium',
      fromQuery,
      caption: 'details',
      labelFor: (issue) => issueLabel(issue, title),
    }),
  }));
}

/** " · Spring 2021 to Winter 2023", from the oldest and newest dates, or nothing if undated. */
function seasonSpan(items: readonly DatedItem[]): string {
  const dates = items
    .map((item) => item.date)
    .filter((date) => date !== undefined)
    .sort();
  const [first] = dates;
  const last = dates.at(-1);
  return first === undefined || last === undefined
    ? ''
    : ` · ${seasonOf(first)} to ${seasonOf(last)}`;
}

/** One value's page: a magazine title's issues by year, newest first (frame 3). */
export function buildGroupPageModel(
  db: Db,
  subcategory: Subcategory,
  page: { readonly spec: GroupSpec; readonly groupSlug: string },
): IndexModel {
  const group = findFieldGroups(db, page.spec).find(
    (candidate) => slugify(candidate.value) === page.groupSlug,
  );
  if (group === undefined) {
    throw new AppError('not-found', `No "${page.groupSlug}" in ${subcategory.name}.`);
  }
  const items = findItemsInFieldGroup(db, page.spec, group.value);
  const query = parseQuery(
    `in:${subcategory.section} sub:${subcategory.slug} ${page.spec.groupFieldKey}:"${group.value}"`,
  );
  return groupedModel({
    title: group.value,
    breadcrumb: [
      ...subcategoryCrumbs(subcategory),
      { label: subcategory.name, href: `/${subcategory.section}/${subcategory.slug}` },
      { label: group.value },
    ],
    caption: `${countLabel(items.length, 'issue')}${seasonSpan(items)}`,
    panelTitle: 'Issues · newest first',
    toolbarNote: 'Group by: Year · Order: Newest first',
    groups: yearGroups(items, group.value, queryToText(query)),
    showFiltersHref: searchHref(query),
  });
}
