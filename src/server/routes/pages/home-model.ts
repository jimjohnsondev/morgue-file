// Reads Home's preview strips and archive counts from the library (frame 12, R34). A strip with
// nothing to show is left out.
import { findCollectionSummaries } from '#core/db/repositories/collections.js';
import { findItemsByQuery } from '#core/db/repositories/item-lists.js';
import { countModels } from '#core/db/repositories/models.js';
import { queryToText } from '#core/query/canonical-query.js';
import { compileQuery } from '#core/query/compile-query.js';
import { filterTerm } from '#core/query/parse-query.js';

import { formatCount } from '../../views/format.js';

import {
  collectionCards,
  newestCards,
  pickedCards,
  recentlyViewedCards,
  SHUFFLE_SEEDS,
} from './card-lists.js';
import { STRIP_LENGTH } from './model-profile-model.js';
import { toThumbCards } from './thumb-cards.js';

import type { Db } from '#core/db/connection.js';
import type { ArchiveCounts } from '#core/db/repositories/archive-counts.js';
import type { PreviewStripModel } from '../../views/parts/preview-strip.js';
import type { ArchiveCountRow, HomeModel } from '../../views/templates/home-template.js';

/** A strip that has cards, else nothing, so empty strips are hidden (R34). */
function stripIfAny(strip: PreviewStripModel): PreviewStripModel[] {
  return strip.cards.length === 0 ? [] : [strip];
}

/** Pick up where you left off: the items viewed last, with the time or page reached. */
function pickUpStrip(db: Db): PreviewStripModel[] {
  return stripIfAny({
    title: 'Pick up where you left off',
    name: 'Pick up where you left off',
    titleLink: { text: 'history »', href: '/history' },
    moreLink: { text: 'All recently viewed »', href: '/history' },
    cards: recentlyViewedCards(db, STRIP_LENGTH),
  });
}

/** Recently added: the newest items in the archive. */
function recentStrip(db: Db): PreviewStripModel[] {
  return stripIfAny({
    title: 'Recently added',
    name: 'Recently added',
    titleLink: { text: 'view all »', href: '/recent' },
    moreLink: { text: 'View all recent »', href: '/recent' },
    cards: newestCards(db, STRIP_LENGTH),
  });
}

/** Waiting in Unsorted: the first items with no subcategory, as the Unsorted page lists them. */
function unsortedStrip(db: Db, unsorted: number): PreviewStripModel[] {
  const query = { terms: [filterTerm('unsorted', '')] };
  const items = findItemsByQuery(db, compileQuery(query), { limit: STRIP_LENGTH, offset: 0 });
  return stripIfAny({
    title: `Waiting in Unsorted · ${formatCount(unsorted)}`,
    name: 'Waiting in Unsorted',
    titleLink: { text: 'file them now »', href: '/unsorted' },
    moreLink: { text: `File all ${formatCount(unsorted)} »`, href: '/unsorted' },
    cards: toThumbCards(items, {
      size: 'medium',
      fromQuery: queryToText(query),
      caption: 'details',
    }),
  });
}

/** Collections: the first few, oldest first, each with its first item as the cover. */
function collectionsStrip(db: Db, collections: number): PreviewStripModel[] {
  const firstFew = findCollectionSummaries(db).slice(0, STRIP_LENGTH);
  return stripIfAny({
    title: `Collections · ${formatCount(collections)}`,
    name: 'Collections',
    titleLink: { text: 'all collections »', href: '/collections' },
    moreLink: { text: `All ${formatCount(collections)} collections »`, href: '/collections' },
    cards: collectionCards(db, firstFew),
  });
}

/** From the archive: a shuffled handful; "shuffle" moves to the next seed. */
function archiveStrip(db: Db, seed: number): PreviewStripModel[] {
  return stripIfAny({
    title: 'From the archive',
    name: 'From the archive',
    titleLink: { text: 'shuffle »', href: `/?shuffle=${String((seed + 1) % SHUFFLE_SEEDS)}` },
    moreLink: { text: 'More from the archive »', href: `/archive?shuffle=${String(seed)}` },
    cards: pickedCards(db, { seed, limit: STRIP_LENGTH }),
  });
}

/** The side column's counts, each linking to its list. */
function countRows(db: Db, counts: ArchiveCounts): ArchiveCountRow[] {
  return [
    { label: 'Photos', href: '/photos', count: counts.images },
    { label: 'Video', href: '/video', count: counts.videos },
    { label: 'Library', href: '/library', count: counts.publications },
    { label: 'Models', href: '/models', count: countModels(db) },
    { label: 'Collections', href: '/collections', count: counts.collections },
    { label: 'Unsorted', href: '/unsorted', count: counts.unsorted },
  ];
}

/** Builds Home: five strips in the frame's order, and the archive's counts beside them. */
export function buildHomeModel(db: Db, counts: ArchiveCounts, seed: number): HomeModel {
  return {
    strips: [
      ...pickUpStrip(db),
      ...recentStrip(db),
      ...unsortedStrip(db, counts.unsorted),
      ...collectionsStrip(db, counts.collections),
      ...archiveStrip(db, seed),
    ],
    counts: countRows(db, counts),
  };
}
