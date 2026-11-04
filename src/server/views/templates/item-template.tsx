// The Item template (R19): one page for every photo, video and Library item. The breadcrumb and
// the Prev · 3 of 1,236 · Next box sit above the viewer slot, with the details panel beside it.
import { formatCount } from '../format.js';
import { Breadcrumb } from '../parts/breadcrumb.js';
import { DetailsEdge, DetailsPanel } from '../parts/details-panel.js';
import { PageReader } from '../parts/page-reader.js';
import { ImageViewer, VideoPlayer } from '../parts/viewers.js';

import type { Crumb } from '../parts/breadcrumb.js';
import type { DetailsModel } from '../parts/details-panel.js';
import type { PageReaderModel } from '../parts/page-reader.js';
import type { ImageViewerModel, VideoPlayerModel } from '../parts/viewers.js';

/** Prev and Next through the list the item was opened from, and the item's place in it. */
export type ListNavModel = {
  readonly previousHref: string | undefined;
  readonly nextHref: string | undefined;
  readonly position: number;
  readonly total: number;
  readonly listLabel: string;
  readonly listHref: string;
};

/** What fills the viewer slot. */
export type ViewerModel = ImageViewerModel | VideoPlayerModel | PageReaderModel;

/** Everything an Item page shows. */
export type ItemModel = {
  readonly breadcrumb: readonly Crumb[];
  readonly listNav: ListNavModel | undefined;
  readonly viewer: ViewerModel;
  /** The open panel, or the link that opens the folded one (frame 6). */
  readonly details:
    | { readonly kind: 'open'; readonly model: DetailsModel }
    | {
        readonly kind: 'folded';
        readonly showHref: string;
      };
};

/** « Prev | 3 of 1,236 in Figure | Next », the arrow keys following the same links. */
function ListNav(props: { readonly nav: ListNavModel }) {
  const { nav } = props;
  return (
    <span class="list-nav">
      «{' '}
      {nav.previousHref === undefined ? (
        'Prev'
      ) : (
        <a href={nav.previousHref} rel="prev" data-key-link="previous">
          Prev
        </a>
      )}{' '}
      | <b>{formatCount(nav.position)}</b> of {formatCount(nav.total)} in{' '}
      <a href={nav.listHref}>{nav.listLabel}</a> |{' '}
      {nav.nextHref === undefined ? (
        'Next'
      ) : (
        <a href={nav.nextHref} rel="next" data-key-link="next">
          Next
        </a>
      )}{' '}
      » <span class="caption">(← → keys)</span>
    </span>
  );
}

/** The viewer that suits the item: image viewer, video player or page reader. */
function ViewerSlot(props: { readonly viewer: ViewerModel }) {
  const { viewer } = props;
  switch (viewer.kind) {
    case 'image':
      return <ImageViewer model={viewer} />;
    case 'video':
      return <VideoPlayer model={viewer} />;
    case 'reader':
      return <PageReader model={viewer} />;
  }
}

/** The whole Item page body; the layout adds the banner, tabs and footer. */
export function ItemTemplate(props: { readonly model: ItemModel }) {
  const { model } = props;
  const isFolded = model.details.kind === 'folded';
  return (
    <div class="item-page">
      <div class="item-page__heading">
        <Breadcrumb crumbs={model.breadcrumb} />
        {model.listNav && <ListNav nav={model.listNav} />}
      </div>
      <div class={isFolded ? 'item-page__body item-page__body--folded' : 'item-page__body'}>
        <ViewerSlot viewer={model.viewer} />
        {model.details.kind === 'open' ? (
          <DetailsPanel model={model.details.model} />
        ) : (
          <DetailsEdge showHref={model.details.showHref} />
        )}
      </div>
      <p class="viewing-hint">
        Press <b>V</b> to bring back the page · ← → next reference
      </p>
    </div>
  );
}
