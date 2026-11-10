// Builds the details panel of an Item page (frames 5, 7, 8): facts by kind, chips for tags,
// models and collections with their edit controls, and the item's own fields as the fields table
// holds them, each with its form (R11).
import { findModelNames } from '#core/db/repositories/archive-counts.js';
import {
  findCollectionsByItem,
  findCollectionSummaries,
} from '#core/db/repositories/collections.js';
import { findModelLinksByItem } from '#core/db/repositories/models.js';
import { findSubcategoriesBySection } from '#core/db/repositories/subcategories.js';
import { findTagNamesByItem } from '#core/db/repositories/tags.js';

import {
  fieldValueText,
  formatDuration,
  formatName,
  formatPages,
  itemLabel,
} from '../../views/format.js';

import { SECTION_LABELS } from './filter-choices.js';
import { itemPageHref } from './item-view.js';

import type { Db } from '#core/db/connection.js';
import type { Item } from '#core/db/repositories/items.js';
import type { ItemModelLink, PageRange } from '#core/db/repositories/models.js';
import type { Subcategory } from '#core/db/repositories/subcategories.js';
import type { FieldWithValue } from '#core/fields/fields.js';
import type { DetailsModel, FactRow, FilingForm } from '../../views/parts/details-panel.js';
import type { FieldRow } from '../../views/parts/item-fields.js';
import type { ItemView } from './item-view.js';

/** The grouped value an issue belongs to: its magazine title, and the issue's own name. */
export type IssueOf = {
  readonly title: string;
  readonly titleHref: string;
  /** "No. 12 · Winter 2023" */
  readonly issue: string;
  /** The keys of the group and date fields, which the facts show as Title and Issue. */
  readonly fieldKeys: readonly string[];
};

/** What the details panel is built from. */
export type DetailsSource = {
  readonly item: Item;
  readonly subcategory: Subcategory | undefined;
  readonly fields: readonly FieldWithValue[];
  readonly issueOf: IssueOf | undefined;
  readonly view: ItemView;
  /** The pages the reader shows, for "add model to pages 12–13". */
  readonly shownPages: readonly number[] | undefined;
};

/** The field that holds the item's rating, shown with the facts as stars (frame 5). */
const RATING_KEY = 'rating';

/** The first rows: what the item is, by name or title and issue. */
function nameFacts(source: DetailsSource): FactRow[] {
  const { item, issueOf } = source;
  if (issueOf !== undefined) {
    return [
      { label: 'Title', text: issueOf.title, href: issueOf.titleHref },
      { label: 'Issue', text: issueOf.issue },
    ];
  }
  const fileName = item.relPath.split('/').at(-1) ?? item.relPath;
  return item.section === 'library'
    ? [{ label: 'Title', text: itemLabel(item) }]
    : [{ label: 'File', text: fileName }];
}

/** The rows that depend on the kind: pixel size, frame rate and length, or pages. */
function mediaFacts(item: Item): FactRow[] {
  const size =
    item.width === undefined || item.height === undefined
      ? undefined
      : `${String(item.width)}×${String(item.height)}`;
  if (item.section === 'library') {
    return item.pageCount === undefined ? [] : [{ label: 'Pages', text: String(item.pageCount) }];
  }
  const rows: FactRow[] = [];
  if (size !== undefined) {
    const fps = item.kind === 'video' && item.fps !== undefined ? ` · ${String(item.fps)} fps` : '';
    rows.push({ label: 'Dimensions', text: `${size}${fps}` });
  }
  if (item.durationMs !== undefined) {
    rows.push({ label: 'Length', text: formatDuration(item.durationMs) });
  }
  return rows;
}

/** Where every field's form posts (R11). */
function fieldAction(itemId: number): string {
  return `/api/items/${String(itemId)}/fields`;
}

/** The rating row, if items have a rating field: stars, or "none", and its [change] (R11). */
function ratingFact(source: DetailsSource): FactRow[] {
  const rating = source.fields.find((entry) => entry.field.key === RATING_KEY);
  if (rating === undefined) {
    return [];
  }
  const label = rating.field.label;
  const value = typeof rating.value === 'number' ? rating.value : undefined;
  return [
    {
      label,
      text: 'none',
      rating: { label, rating: value, action: fieldAction(source.item.id) },
    },
  ];
}

/** The [move] form: Unsorted, then the subcategories of the item's own section (R5). */
function filingForm(db: Db, source: DetailsSource): FilingForm {
  const { item, subcategory } = source;
  return {
    action: `/api/items/${String(item.id)}/subcategory`,
    choices: [
      { value: 'unsorted', label: 'Unsorted' },
      ...findSubcategoriesBySection(db, item.section).map((choice) => ({
        value: String(choice.id),
        label: choice.name,
      })),
    ],
    current: subcategory === undefined ? 'unsorted' : String(subcategory.id),
  };
}

/** The facts table: name, section, subcategory, media details, format and rating. */
function factRows(db: Db, source: DetailsSource): FactRow[] {
  const { item, subcategory } = source;
  return [
    ...nameFacts(source),
    { label: 'Section', text: SECTION_LABELS[item.section] },
    {
      label: 'Subcategory',
      text: subcategory?.name ?? 'Unsorted',
      filing: filingForm(db, source),
    },
    ...mediaFacts(item),
    { label: 'Format', text: formatName(item) },
    ...ratingFact(source),
  ];
}

/** The fields table: every field but the rating and any shown as Title and Issue. */
function fieldRows(source: DetailsSource): FieldRow[] {
  const shownAbove = new Set([RATING_KEY, ...(source.issueOf?.fieldKeys ?? [])]);
  return source.fields
    .filter((entry) => !shownAbove.has(entry.field.key))
    .map((entry) => ({
      key: entry.field.key,
      label: entry.field.label,
      type: entry.field.type,
      text: fieldValueText(entry),
      box: {
        key: entry.field.key,
        type: entry.field.type,
        value: entry.value === undefined ? '' : String(entry.value),
        choices: entry.field.options,
      },
    }));
}

/** The item's collections as chips, each [x] taking it out, and the ones it can be added to. */
function collectionParts(db: Db, itemId: number) {
  const itemPath = `/api/items/${String(itemId)}`;
  const holding = findCollectionsByItem(db, itemId);
  const heldIds = new Set(holding.map((collection) => collection.id));
  return {
    collections: holding.map((collection) => ({
      label: collection.name,
      href: `/collections/${String(collection.id)}`,
      removeAction: `${itemPath}/collections/${String(collection.id)}`,
    })),
    collectionAdding: {
      action: `${itemPath}/collections`,
      choices: findCollectionSummaries(db)
        .filter((collection) => !heldIds.has(collection.id))
        .map((collection) => ({ value: String(collection.id), label: collection.name })),
    },
  };
}

/** The item's tags as chips, each [x] taking the tag off (R10). */
function tagChips(db: Db, itemId: number) {
  return findTagNamesByItem(db, itemId).map((name) => ({
    label: name,
    removeAction: `/api/items/${String(itemId)}/tags/${encodeURIComponent(name)}`,
  }));
}

/** The model chips' [x]: a DELETE of that one link, naming its pages if it has a range. */
function unlinkAction(itemId: number, link: ItemModelLink): string {
  const action = `/api/items/${String(itemId)}/models/${String(link.modelId)}`;
  return link.pages === undefined
    ? action
    : `${action}?from=${String(link.pages[0])}&to=${String(link.pages[1])}`;
}

/** Says whether a model link already covers what "add model" would add: these pages, or all. */
function isLinkedOver(link: ItemModelLink, pages: PageRange | undefined): boolean {
  return pages === undefined
    ? link.pages === undefined
    : link.pages?.[0] === pages[0] && link.pages[1] === pages[1];
}

/** The pages on show in the reader, first to last; none outside the reader. */
function pagesShown(shownPages: readonly number[] | undefined): PageRange | undefined {
  const [first, last] = [shownPages?.[0], shownPages?.at(-1)];
  return first === undefined || last === undefined ? undefined : [first, last];
}

/**
 * The item's models as chips, each [x] unlinking it, and how to add one (R15): a list of the
 * models it isn't linked to as a whole, or, in the reader, over the pages on show (R17).
 */
function modelParts(db: Db, source: DetailsSource) {
  const { item, view } = source;
  const links = findModelLinksByItem(db, item.id);
  const models = links.map((link) => ({
    label: link.name,
    href: `/models/${encodeURIComponent(link.slug)}`,
    removeAction: unlinkAction(item.id, link),
    ...(link.pages !== undefined && {
      note: {
        text: formatPages(...link.pages),
        href: itemPageHref(item.id, view, { page: link.pages[0] }),
      },
    }),
  }));
  const pages = pagesShown(source.shownPages);
  const linked = new Set(
    links.filter((link) => isLinkedOver(link, pages)).map((link) => link.modelId),
  );
  const choices = findModelNames(db)
    .filter((model) => !linked.has(model.id))
    .map((model) => ({ value: String(model.id), label: model.name }));
  const modelAdding = {
    action: `/api/items/${String(item.id)}/models`,
    models: choices,
    label: pages === undefined ? 'add model' : `add model to ${formatPages(...pages)}`,
    ...(pages !== undefined && { pages }),
  };
  return { models, modelAdding };
}

/** Builds the details panel for one item. */
export function buildDetailsModel(db: Db, source: DetailsSource): DetailsModel {
  const { item, view } = source;
  return {
    facts: factRows(db, source),
    tags: tagChips(db, item.id),
    tagAction: `/api/items/${String(item.id)}/tags`,
    ...modelParts(db, source),
    ...collectionParts(db, item.id),
    fields: fieldRows(source),
    fieldAction: fieldAction(item.id),
    hideHref: itemPageHref(item.id, view, { isDetailsHidden: true }),
  };
}
