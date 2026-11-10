// Reads one item from the library and lays out its Item page (R19): breadcrumb, the list it
// steps through, the viewer that suits its kind, and the details panel.
import { findItemById } from '#core/db/repositories/items.js';
import { findRootById } from '#core/db/repositories/roots.js';
import { findSubcategoryById } from '#core/db/repositories/subcategories.js';
import { AppError } from '#core/errors.js';
import { readFieldValues } from '#core/fields/fields.js';
import { filterTerm, parseQuery } from '#core/query/parse-query.js';

import { itemLabel } from '../../views/format.js';

import { SECTION_LABELS } from './filter-choices.js';
import {
  groupSpecFor,
  groupValuePath,
  groupValueQuery,
  issueLabel,
  subcategoryPath,
  subcategoryTerms,
} from './group-model.js';
import { buildDetailsModel } from './item-details.js';
import { itemPageHref } from './item-view.js';
import { buildViewerModel } from './item-viewers.js';
import { findListContext } from './list-context.js';

import type { Db } from '#core/db/connection.js';
import type { Item, Section } from '#core/db/repositories/items.js';
import type { Subcategory } from '#core/db/repositories/subcategories.js';
import type { FieldValue } from '#core/fields/field-values.js';
import type { FieldWithValue } from '#core/fields/fields.js';
import type { Query } from '#core/query/query-types.js';
import type { Crumb } from '../../views/parts/breadcrumb.js';
import type { ItemModel, ListNavModel, ViewerModel } from '../../views/templates/item-template.js';
import type { IssueOf } from './item-details.js';
import type { ItemView } from './item-view.js';

/** An Item page's model, with the page title and the section whose tab it sits under. */
export type ItemPage = {
  readonly title: string;
  readonly section: Section;
  readonly model: ItemModel;
};

/** An item with what its page needs to know about where it's filed. */
type FiledItem = {
  readonly item: Item;
  readonly subcategory: Subcategory | undefined;
  readonly fields: readonly FieldWithValue[];
  /** The magazine title and issue, and the title's list, if the item is an issue (frame 8). */
  readonly issueOf: (IssueOf & { readonly query: Query }) | undefined;
};

/** The value of one of the item's fields, by key. */
function fieldValue(fields: readonly FieldWithValue[], key: string): FieldValue | undefined {
  return fields.find((entry) => entry.field.key === key)?.value;
}

/** The magazine title and issue an item is, if its subcategory groups by a field (frame 8). */
function findIssueOf(db: Db, filed: Omit<FiledItem, 'issueOf'>): FiledItem['issueOf'] {
  const { item, subcategory, fields } = filed;
  const spec = subcategory === undefined ? undefined : groupSpecFor(db, subcategory);
  if (subcategory === undefined || spec === undefined) {
    return undefined;
  }
  const title = fieldValue(fields, spec.groupFieldKey);
  const date = fieldValue(fields, spec.dateFieldKey);
  if (typeof title !== 'string') {
    return undefined;
  }
  const dated = { relPath: item.relPath, date: typeof date === 'string' ? date : undefined };
  return {
    title,
    titleHref: groupValuePath(subcategory, title),
    issue: issueLabel(dated, title),
    fieldKeys: [spec.groupFieldKey, spec.dateFieldKey],
    query: groupValueQuery(subcategory, spec, title),
  };
}

/** Reads an item, where it's filed and its fields, or refuses an id that doesn't exist. */
function readFiledItem(db: Db, itemId: number): FiledItem {
  const item = findItemById(db, itemId);
  if (item === undefined) {
    throw new AppError('not-found', `No item ${String(itemId)}.`);
  }
  const subcategory =
    item.subcategoryId === undefined ? undefined : findSubcategoryById(db, item.subcategoryId);
  const fields = readFieldValues(db, {
    entity: 'item',
    entityId: item.id,
    ...(subcategory !== undefined && { subcategoryId: subcategory.id }),
  });
  return { item, subcategory, fields, issueOf: findIssueOf(db, { item, subcategory, fields }) };
}

/** The subcategory an item is filed under, or Unsorted, as a link. */
function filedUnderLink(filed: FiledItem): { label: string; href: string } {
  const { subcategory } = filed;
  return subcategory === undefined
    ? { label: 'Unsorted', href: '/unsorted' }
    : { label: subcategory.name, href: subcategoryPath(subcategory) };
}

/** Home › Photos › Figure › seated_backlit_017.jpg, with the magazine title before an issue. */
function itemCrumbs(filed: FiledItem): Crumb[] {
  const { item, issueOf } = filed;
  const section = { label: SECTION_LABELS[item.section], href: `/${item.section}` };
  const filedUnder = filedUnderLink(filed);
  const title = issueOf === undefined ? [] : [{ label: issueOf.title, href: issueOf.titleHref }];
  const name = issueOf?.issue ?? itemLabel(item);
  return [{ label: 'Home', href: '/' }, section, filedUnder, ...title, { label: name }];
}

/** The list an item opened without one steps through: its magazine title, subcategory or Unsorted. */
function homeListOf(filed: FiledItem): Query {
  if (filed.issueOf !== undefined) {
    return filed.issueOf.query;
  }
  return filed.subcategory === undefined
    ? { terms: [filterTerm('unsorted', '')] }
    : { terms: subcategoryTerms(filed.subcategory) };
}

/** Prev and Next through the list, keeping the view (details folded, viewing mode). */
function listNavFor(
  db: Db,
  itemId: number,
  list: { readonly query: Query; readonly view: ItemView },
): ListNavModel | undefined {
  const context = findListContext(db, list.query, itemId);
  if (context === undefined) {
    return undefined;
  }
  const changes = { from: context.fromQuery, page: 1 };
  return {
    previousHref:
      context.previousId === undefined
        ? undefined
        : itemPageHref(context.previousId, list.view, changes),
    nextHref:
      context.nextId === undefined ? undefined : itemPageHref(context.nextId, list.view, changes),
    position: context.position,
    total: context.total,
    listLabel: context.label,
    listHref: context.href,
  };
}

/**
 * Where the viewer opens, for the viewing history (R35): the first page on show in the reader, or
 * the video time it starts at. A photo, or an original that can't be opened, has none.
 */
function positionOnShow(viewer: ViewerModel, view: ItemView): number | undefined {
  switch (viewer.kind) {
    case 'reader':
      return viewer.shownPages[0];
    case 'video':
      return view.startSeconds ?? 0;
    default:
      return undefined;
  }
}

/** Reads an item and builds its page (R19), or refuses an id that doesn't exist. */
export function buildItemPage(db: Db, itemId: number, view: ItemView): ItemPage {
  const filed = readFiledItem(db, itemId);
  const { item } = filed;
  const query = view.from === undefined ? homeListOf(filed) : parseQuery(view.from);
  const viewer = buildViewerModel({
    item,
    label: itemLabel(item),
    view,
    root: findRootById(db, item.rootId),
    back: filed.issueOf
      ? { label: filed.issueOf.title, href: filed.issueOf.titleHref }
      : filedUnderLink(filed),
  });
  const shownPages = viewer.kind === 'reader' ? viewer.shownPages : undefined;
  return {
    title: itemLabel(item),
    section: item.section,
    model: {
      history: { itemId: item.id, position: positionOnShow(viewer, view) },
      breadcrumb: itemCrumbs(filed),
      listNav: listNavFor(db, item.id, { query, view }),
      viewer,
      details: view.isDetailsHidden
        ? { kind: 'folded', showHref: itemPageHref(item.id, view, { isDetailsHidden: false }) }
        : { kind: 'open', model: buildDetailsModel(db, { ...filed, view, shownPages }) },
    },
  };
}
