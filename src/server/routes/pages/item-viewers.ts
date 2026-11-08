// Builds the viewer slot of an Item page: the image viewer, video player or page reader, by kind,
// or the cached thumbnail when the original can't be opened (E4).
import path from 'node:path';

import {
  defaultThumbnailSize,
  hasSquareThumbnail,
  sizeToLabel,
} from '#core/jobs/thumbnail-files.js';

import { itemPageHref, viewParams } from './item-view.js';
import { pagesOnShow, readerTargets } from './reader-pages.js';

import type { Item } from '#core/db/repositories/items.js';
import type { Root } from '#core/db/repositories/roots.js';
import type { ItemView } from './item-view.js';
import type { PageReaderModel, ReaderLink } from '../../views/parts/page-reader.js';
import type { UnavailableViewerModel } from '../../views/parts/unavailable-viewer.js';
import type { ViewerFrame } from '../../views/parts/viewers.js';
import type { ViewerModel } from '../../views/templates/item-template.js';

/** The frame rate frame-step uses when ffprobe hasn't measured the video yet. */
const DEFAULT_FPS = 30;

/**
 * What the viewer is built from: the item, the name it shows, how the page is viewed, its root
 * (for whether the drive is online), and the list "Back to" leads to if the original is gone.
 */
type ViewerSource = {
  readonly item: Item;
  readonly label: string;
  readonly view: ItemView;
  readonly root: Root | undefined;
  readonly back: { readonly label: string; readonly href: string };
};

/** A link of the reader's toolbar to a page of this item, or plain text if there's no page. */
function readerLink(source: ViewerSource, label: string, page: number | undefined): ReaderLink {
  return {
    label,
    href: page === undefined ? undefined : itemPageHref(source.item.id, source.view, { page }),
  };
}

/** The page reader for a PDF, CBZ or page folder, at the page and layout the URL asks for. */
function readerModel(source: ViewerSource, frame: ViewerFrame): PageReaderModel {
  const { item, view } = source;
  // The page count arrives with the thumbnail job; until then the reader knows only page 1.
  const pageCount = item.pageCount ?? 1;
  const shownPages = pagesOnShow(Math.min(view.page, pageCount), view.layout, pageCount);
  const targets = readerTargets(shownPages, pageCount);
  const unit = view.layout === 'spread' ? 'spread' : 'page';
  const [firstShown = 1] = shownPages;
  const lastShown = shownPages.at(-1) ?? firstShown;
  return {
    ...frame,
    kind: 'reader',
    source: item.kind === 'pdf' ? 'pdf' : 'pictures',
    src:
      item.kind === 'pdf' ? `/media/original/${String(item.id)}` : `/media/page/${String(item.id)}`,
    stripPictureSrc: (page) =>
      `/media/page-strip/${String(item.id)}/${String(page)}?v=${String(item.mtimeMs)}`,
    pageCount,
    shownPages,
    shownLabel:
      firstShown === lastShown
        ? `Page ${String(firstShown)}`
        : `Pages ${String(firstShown)}–${String(lastShown)}`,
    isSpread: view.layout === 'spread',
    first: readerLink(source, 'First', targets.first),
    previous: readerLink(source, `Prev ${unit}`, targets.previous),
    next: readerLink(source, `Next ${unit}`, targets.next),
    last: readerLink(source, 'Last', targets.last),
    singleHref: itemPageHref(item.id, view, { layout: 'single', page: firstShown }),
    spreadHref: itemPageHref(item.id, view, { layout: 'spread', page: firstShown }),
    pageHref: (page) => itemPageHref(item.id, view, { page }),
    jump: { action: `/item/${String(item.id)}`, keep: Object.fromEntries(viewParams(view)) },
  };
}

/** Why the original can't be opened, or undefined if it can: an offline drive, or a lost file. */
function unavailableReason(source: ViewerSource): UnavailableViewerModel['reason'] | undefined {
  if (source.root === undefined || source.root.status === 'offline') {
    return 'offline';
  }
  return source.item.missingSince === undefined ? undefined : 'missing';
}

/** The cached thumbnail in the viewer slot, enlarged, with a note about the original (E4). */
function unavailableModel(
  source: ViewerSource,
  reason: UnavailableViewerModel['reason'],
): UnavailableViewerModel {
  const { item, label, view } = source;
  // The default size is the one always in the cache; the other sizes need the original.
  const size = sizeToLabel(defaultThumbnailSize(item.kind));
  const note = reason === 'offline' ? 'zoom unavailable while offline' : 'original missing';
  return {
    kind: 'unavailable',
    title: `Viewer · ${label} · ${note}`,
    viewingHref: itemPageHref(item.id, view, { isViewing: true }),
    reason,
    thumbSrc: `/media/thumb/${String(item.id)}/${size}?v=${String(item.mtimeMs)}`,
    shape: hasSquareThumbnail(item.kind) ? 'square' : 'cover',
    alt: label,
    filePath: path.join(source.root?.path ?? '', ...item.relPath.split('/')),
    tryAgainHref: itemPageHref(item.id, view, {}),
    back: source.back,
  };
}

/** The viewer that suits the item's kind, or its thumbnail if the original can't be opened. */
export function buildViewerModel(source: ViewerSource): ViewerModel {
  const { item, label, view } = source;
  const reason = unavailableReason(source);
  if (reason !== undefined) {
    return unavailableModel(source, reason);
  }
  const viewingHref = itemPageHref(item.id, view, { isViewing: true });
  const original = `/media/original/${String(item.id)}`;
  switch (item.kind) {
    case 'image':
      return {
        kind: 'image',
        title: `Viewer · ${label}`,
        viewingHref,
        src: original,
        alt: label,
        width: item.width,
        height: item.height,
      };
    case 'video':
      return {
        kind: 'video',
        title: `Player · ${label}`,
        viewingHref,
        src: original,
        durationMs: item.durationMs,
        fps: item.fps ?? DEFAULT_FPS,
        startSeconds: view.startSeconds,
      };
    default:
      return readerModel(source, { title: `Reader · ${label}`, viewingHref });
  }
}
