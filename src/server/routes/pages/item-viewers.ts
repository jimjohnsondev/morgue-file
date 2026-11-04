// Builds the viewer slot of an Item page: the image viewer, video player or page reader, by kind.
import { itemPageHref, viewParams } from './item-view.js';
import { pagesOnShow, readerTargets } from './reader-pages.js';

import type { Item } from '#core/db/repositories/items.js';
import type { ItemView } from './item-view.js';
import type { PageReaderModel, ReaderLink } from '../../views/parts/page-reader.js';
import type { ViewerFrame } from '../../views/parts/viewers.js';
import type { ViewerModel } from '../../views/templates/item-template.js';

/** The frame rate frame-step uses when ffprobe hasn't measured the video yet. */
const DEFAULT_FPS = 30;

/** What the viewer is built from: the item, the name it shows, and how the page is viewed. */
type ViewerSource = {
  readonly item: Item;
  readonly label: string;
  readonly view: ItemView;
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

/** The viewer that suits the item's kind. */
export function buildViewerModel(source: ViewerSource): ViewerModel {
  const { item, label, view } = source;
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
      };
    default:
      return readerModel(source, { title: `Reader · ${label}`, viewingHref });
  }
}
