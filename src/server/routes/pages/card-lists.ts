// The lists that aren't a query: models, collections, recently viewed and recently added. Each
// is one fixed page shown by the Index template, so they look like every other list, and each is
// the full list behind one of Home's strips (R34).
import { findModelNames } from '#core/db/repositories/archive-counts.js';
import {
  findCollectionCoverIds,
  findCollectionSummaries,
} from '#core/db/repositories/collections.js';
import { findListedItemsByIds, findNewestItems } from '#core/db/repositories/item-lists.js';
import { findRecentlyViewedItems, KEPT_VIEWS } from '#core/db/repositories/item-views.js';
import { findModelBySlug, findModelTagNames } from '#core/db/repositories/models.js';

import { formatDuration } from '../../views/format.js';
import { countLabel } from '../../views/templates/index-template.js';
import { requireLibrary } from '../require-library.js';

import { sendIndexPage } from './render-index.js';
import { itemPlace, thumbnailSrc, toThumbCards } from './thumb-cards.js';

import type { Db } from '#core/db/connection.js';
import type { CollectionSummary } from '#core/db/repositories/collections.js';
import type { ListedItem } from '#core/db/repositories/item-lists.js';
import type { Crumb } from '../../views/parts/breadcrumb.js';
import type { ThumbCard } from '../../views/parts/thumb-grid.js';
import type { IndexModel } from '../../views/templates/index-template.js';
import type { PageContext } from '../page-context.js';
import type { FastifyInstance } from 'fastify';

/** How many of the newest items Recently added lists. */
const RECENT_LENGTH = 96;

/** What a fixed list says about itself; the template's other parts stay empty. */
type FixedList = {
  readonly title: string;
  readonly crumbs: readonly Crumb[];
  readonly cards: readonly ThumbCard[];
  /** What one card is: "model", "collection", "item". */
  readonly noun: string;
  readonly emptyText: string;
};

/** An Index model for a list shown whole: no pager, filters or view choices. */
function fixedListModel(list: FixedList): IndexModel {
  const count = countLabel(list.cards.length, list.noun);
  return {
    title: list.title,
    breadcrumb: [{ label: 'Home', href: '/' }, ...list.crumbs],
    caption: count,
    panelTitle: `Browse · ${count}`,
    size: 'medium',
    groups: [{ cards: list.cards }],
    emptyText: list.emptyText,
    toolbar: { sizes: undefined, perPage: undefined },
    paging: undefined,
    filterPanel: undefined,
    showFiltersHref: undefined,
    activeFilters: undefined,
  };
}

/** One card per collection, its first item standing as the cover. */
export function collectionCards(db: Db, collections: readonly CollectionSummary[]): ThumbCard[] {
  const coverIds = findCollectionCoverIds(db);
  const covers = new Map(
    findListedItemsByIds(db, [...coverIds.values()]).map((item) => [item.id, item]),
  );
  return collections.map((collection) => {
    const coverId = coverIds.get(collection.id);
    const cover = coverId === undefined ? undefined : covers.get(coverId);
    return {
      key: `collection-${String(collection.id)}`,
      href: `/collections/${String(collection.id)}`,
      imageSrc: cover && thumbnailSrc(cover, 'medium'),
      shape: cover?.section === 'library' ? 'cover' : 'square',
      label: collection.name,
      details: countLabel(collection.itemCount, 'item'),
    };
  });
}

/** One card per model, alphabetically: the portrait, the name and the model's tags. */
function modelCards(db: Db): ThumbCard[] {
  return findModelNames(db).flatMap((named) => {
    const model = findModelBySlug(db, named.slug);
    if (model === undefined) {
      return [];
    }
    const portraitIds = model.portraitItemId === undefined ? [] : [model.portraitItemId];
    const [portrait] = findListedItemsByIds(db, portraitIds);
    const card: ThumbCard = {
      key: model.slug,
      href: `/models/${encodeURIComponent(model.slug)}`,
      imageSrc: portrait && thumbnailSrc(portrait, 'medium'),
      shape: 'square',
      label: named.name,
      details: findModelTagNames(db, model.id).join(' · '),
    };
    return [card];
  });
}

/** Where a viewer got to in an item, after where the item is filed: "Video › Poses · at 0:42". */
function viewedCaption(item: ListedItem, position: number | undefined): string {
  if (position === undefined || item.section === 'photos') {
    return itemPlace(item);
  }
  const reached =
    item.section === 'video'
      ? `at ${formatDuration(position * 1000)}`
      : `page ${String(Math.round(position))}`;
  return `${itemPlace(item)} · ${reached}`;
}

/** Cards for the items viewed last, newest first, each once, with where the viewer got to. */
export function recentlyViewedCards(db: Db, limit: number): ThumbCard[] {
  const views = findRecentlyViewedItems(db, limit);
  const positions = new Map(views.map((view) => [view.itemId, view.position]));
  const items = findListedItemsByIds(
    db,
    views.map((view) => view.itemId),
  );
  return toThumbCards(items, {
    size: 'medium',
    fromQuery: undefined,
    caption: 'where',
    detailsFor: (item) => viewedCaption(item, positions.get(item.id)),
  });
}

/** Cards for the newest items, newest first, each captioned with where it is filed. */
export function newestCards(db: Db, limit: number): ThumbCard[] {
  return toThumbCards(findNewestItems(db, limit), {
    size: 'medium',
    fromQuery: undefined,
    caption: 'where',
  });
}

/** The fixed lists by URL, and the tab each sits under. */
const FIXED_LISTS: readonly {
  readonly url: string;
  readonly tab: string;
  readonly listFor: (db: Db) => FixedList;
}[] = [
  {
    url: '/models',
    tab: '/models',
    listFor: (db) => ({
      title: 'Models',
      crumbs: [{ label: 'Models' }],
      cards: modelCards(db),
      noun: 'model',
      emptyText: 'No model profiles yet.',
    }),
  },
  {
    url: '/collections',
    tab: '/collections',
    listFor: (db) => ({
      title: 'Collections',
      crumbs: [{ label: 'Collections' }],
      cards: collectionCards(db, findCollectionSummaries(db)),
      noun: 'collection',
      emptyText: 'No collections yet.',
    }),
  },
  {
    url: '/history',
    tab: '/',
    listFor: (db) => ({
      title: 'Recently viewed',
      crumbs: [{ label: 'Recently viewed' }],
      cards: recentlyViewedCards(db, KEPT_VIEWS),
      noun: 'item',
      emptyText: 'Nothing viewed yet.',
    }),
  },
  {
    url: '/recent',
    tab: '/',
    listFor: (db) => ({
      title: 'Recently added',
      crumbs: [{ label: 'Recently added' }],
      cards: newestCards(db, RECENT_LENGTH),
      noun: 'item',
      emptyText: 'Nothing added yet.',
    }),
  },
];

/** Registers /models, /collections, /history and /recent. */
export function registerCardListRoutes(app: FastifyInstance, context: PageContext): void {
  for (const list of FIXED_LISTS) {
    app.get(list.url, async (_request, reply) => {
      const { db } = requireLibrary(context.library);
      const model = fixedListModel(list.listFor(db));
      return sendIndexPage(reply, { context, db, model, frame: { currentTab: list.tab } });
    });
  }
}
