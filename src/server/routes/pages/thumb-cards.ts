// Turns listed items into the thumbnail cards an Index grid draws.
import {
  DEFAULT_COVER,
  hasSquareThumbnail,
  SQUARE_SIZES,
  sizeToLabel,
} from '#core/jobs/thumbnail-files.js';

import { itemDetails, itemLabel } from '../../views/format.js';

import { SECTION_LABELS } from './filter-choices.js';

import type { ListedItem } from '#core/db/repositories/item-lists.js';
import type { SquareSizeName } from '#core/jobs/thumbnail-files.js';
import type { ThumbCard } from '../../views/parts/thumb-grid.js';

/** How the cards are drawn: the square size, the query they came from, and the caption line. */
export type CardOptions = {
  readonly size: SquareSizeName;
  /**
   * The canonical query of the list, so the Item page can step through it (R19). Lists that
   * aren't a query (Recently added) leave it out, and the item steps through its own place.
   */
  readonly fromQuery: string | undefined;
  /** "where" captions say where an item is filed (search results); "details" give its size. */
  readonly caption: 'where' | 'details';
};

/** Card options, plus a label or caption of the list's own in place of the usual ones. */
export type LabelledCardOptions<Listed extends ListedItem> = CardOptions & {
  readonly labelFor?: (item: Listed) => string;
  readonly detailsFor?: (item: Listed) => string | undefined;
};

/** Where an item sits: Photos › Figure, or Photos › Unsorted. */
export function itemPlace(item: ListedItem): string {
  return `${SECTION_LABELS[item.section]} › ${item.subcategoryName ?? 'Unsorted'}`;
}

/** The thumbnail URL. The file time in it gives a changed file's thumbnail a new address. */
export function thumbnailSrc(
  item: Pick<ListedItem, 'id' | 'kind' | 'mtimeMs'>,
  size: SquareSizeName,
) {
  const label = sizeToLabel(hasSquareThumbnail(item.kind) ? SQUARE_SIZES[size] : DEFAULT_COVER);
  return `/media/thumb/${String(item.id)}/${label}?v=${String(item.mtimeMs)}`;
}

/** The link to an item's page, carrying the list it was opened from, if it was a query. */
export function itemHref(itemId: number, fromQuery: string | undefined): string {
  const path = `/item/${String(itemId)}`;
  return fromQuery === undefined
    ? path
    : `${path}?${new URLSearchParams({ from: fromQuery }).toString()}`;
}

/** One card per item, in list order. */
export function toThumbCards<Listed extends ListedItem>(
  items: readonly Listed[],
  options: LabelledCardOptions<Listed>,
): ThumbCard[] {
  return items.map((item) => ({
    key: String(item.id),
    href: itemHref(item.id, options.fromQuery),
    imageSrc: thumbnailSrc(item, options.size),
    shape: hasSquareThumbnail(item.kind) ? 'square' : 'cover',
    label: options.labelFor?.(item) ?? itemLabel(item),
    details:
      options.detailsFor?.(item) ??
      (options.caption === 'where' ? itemPlace(item) : itemDetails(item)),
  }));
}
