// Reads a model's profile from the library and lays it out for the Model profile template
// (frame 10): fields, tags, portrait, and a preview strip for each section the model is in (R16).
import { countItemsBySectionByQuery, findItemsByQuery } from '#core/db/repositories/item-lists.js';
import { findItemById } from '#core/db/repositories/items.js';
import { findModelTagNames, findPageRangesByModel } from '#core/db/repositories/models.js';
import { isModelName, readFieldValues } from '#core/fields/fields.js';
import { queryToText } from '#core/query/canonical-query.js';
import { compileQuery } from '#core/query/compile-query.js';
import { filterTerm } from '#core/query/parse-query.js';

import { fieldValueText, formatCount, formatPages } from '../../views/format.js';

import { searchHref } from './active-filters.js';
import { SECTION_LABELS } from './filter-choices.js';
import { itemPageHref, toItemView } from './item-view.js';
import { itemPlace, itemHref, thumbnailSrc, toThumbCards } from './thumb-cards.js';

import type { Db } from '#core/db/connection.js';
import type { Section } from '#core/db/repositories/items.js';
import type { ModelRow, PageRange } from '#core/db/repositories/models.js';
import type { FieldWithValue } from '#core/fields/fields.js';
import type { Query } from '#core/query/query-types.js';
import type { PreviewStripModel, StripLink } from '../../views/parts/preview-strip.js';
import type {
  ModelProfileModel,
  PortraitModel,
} from '../../views/templates/model-profile-template.js';

/** How many thumbnails a preview strip shows before its "View all" link. */
export const STRIP_LENGTH = 6;

const SECTIONS: readonly Section[] = ['photos', 'video', 'library'];

/** The model's items in one section, as the search page lists them: `in:photos model:Elena`. */
export function sectionQuery(section: Section, modelName: string): Query {
  return { terms: [filterTerm('in', section), filterTerm('model', modelName)] };
}

/** The portrait's thumbnail and the item it comes from, if the model has one. */
function portraitFor(db: Db, itemId: number | undefined): PortraitModel | undefined {
  const item = itemId === undefined ? undefined : findItemById(db, itemId);
  if (item === undefined) {
    return undefined;
  }
  const isSquare = item.section !== 'library';
  return {
    imageSrc: thumbnailSrc(item, 'large'),
    shape: isSquare ? 'square' : 'cover',
    itemHref: itemHref(item.id, undefined),
    fileName: item.relPath.split('/').at(-1) ?? item.relPath,
  };
}

/** The pages a model is on in one item, for the caption under a Library cover. */
function pagesCaption(ranges: readonly PageRange[] | undefined): string | undefined {
  return ranges?.map(([first, last]) => formatPages(first, last)).join(', ');
}

/**
 * Where a Library cover on the strip opens: the item at the first page the model is on, in the
 * order of the strip's "View all" list (R17), or its first page when the model is in all of it.
 */
function libraryCardHref(
  itemId: number,
  link: { readonly fromQuery: string; readonly ranges: readonly PageRange[] | undefined },
): string {
  const view = toItemView({ from: link.fromQuery });
  return itemPageHref(itemId, view, { page: link.ranges?.[0]?.[0] ?? 1 });
}

/** One section's strip: its first few items in list order, and links to all of them. */
function sectionStrip(
  db: Db,
  strip: {
    readonly section: Section;
    readonly count: number;
    readonly modelName: string;
    readonly pageRanges: ReadonlyMap<number, readonly PageRange[]>;
  },
): PreviewStripModel {
  const { section, count, modelName, pageRanges } = strip;
  const query = sectionQuery(section, modelName);
  const label = SECTION_LABELS[section];
  const items = findItemsByQuery(db, compileQuery(query), { limit: STRIP_LENGTH, offset: 0 });
  const fromQuery = queryToText(query);
  return {
    title: `${label} · ${formatCount(count)}`,
    name: `${label} featuring ${modelName}`,
    titleLink: { text: 'view all »', href: searchHref(query) },
    moreLink: { text: `View all ${formatCount(count)} in ${label} »`, href: searchHref(query) },
    cards: toThumbCards(items, {
      size: 'medium',
      fromQuery,
      caption: 'details',
      detailsFor: (item) =>
        section === 'library' ? pagesCaption(pageRanges.get(item.id)) : itemPlace(item),
      ...(section === 'library' && {
        hrefFor: (item) => libraryCardHref(item.id, { fromQuery, ranges: pageRanges.get(item.id) }),
      }),
    }),
  };
}

/** A model's name, from its Name field; a model somehow without one is named by its slug. */
export function readModelName(fields: readonly FieldWithValue[], model: ModelRow): string {
  const nameValue = fields.find((entry) => isModelName(entry.field))?.value;
  return nameValue === undefined ? model.slug : String(nameValue);
}

/**
 * Builds a model's profile. Sections the model isn't in get neither a strip nor an "Appears in"
 * link (R16).
 */
export function buildModelProfileModel(db: Db, model: ModelRow): ModelProfileModel {
  const fields = readFieldValues(db, { entity: 'model', entityId: model.id });
  const modelName = readModelName(fields, model);
  const counts = countItemsBySectionByQuery(
    db,
    compileQuery({ terms: [filterTerm('model', modelName)] }),
  );
  const pageRanges = findPageRangesByModel(db, model.id);
  const sections = SECTIONS.flatMap((section) => {
    const count = counts.get(section) ?? 0;
    return count === 0 ? [] : [{ section, count }];
  });
  const appearsIn: StripLink[] = sections.map(({ section, count }) => ({
    text: `${SECTION_LABELS[section]} (${formatCount(count)})`,
    href: searchHref(sectionQuery(section, modelName)),
  }));
  return {
    name: modelName,
    editHref: `/models/${model.slug}/edit`,
    breadcrumb: [
      { label: 'Home', href: '/' },
      { label: 'Models', href: '/models' },
      { label: modelName },
    ],
    portrait: portraitFor(db, model.portraitItemId),
    fields: fields.map((entry) => ({
      key: entry.field.key,
      label: entry.field.label,
      type: entry.field.type,
      text: fieldValueText(entry),
    })),
    tags: findModelTagNames(db, model.id),
    appearsIn,
    strips: sections.map(({ section, count }) =>
      sectionStrip(db, { section, count, modelName, pageRanges }),
    ),
  };
}
