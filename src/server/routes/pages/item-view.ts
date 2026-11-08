// How an Item page is viewed: the list it was opened from, the reader's page and layout, whether
// the details panel is folded, viewing mode, and the video time to start at. All of it lives in
// the URL, so Prev and Next, the page strip and the panel toggle are plain links that work with
// JavaScript off.
import { Type } from '@sinclair/typebox';

import type { Static } from '@sinclair/typebox';

/** The query-string parameters an Item page takes. */
export const ItemViewQuerystring = Type.Object({
  /** The canonical query of the Index the item was opened from (R19). */
  from: Type.Optional(Type.String()),
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  layout: Type.Optional(Type.Union([Type.Literal('single'), Type.Literal('spread')])),
  details: Type.Optional(Type.Literal('hidden')),
  mode: Type.Optional(Type.Literal('viewing')),
  /** The video time to start at, in seconds: where Home's history left off (R35). */
  t: Type.Optional(Type.Number({ minimum: 0, maximum: 1_000_000 })),
});

/** The parsed query string of an Item page. */
export type ItemViewParams = Static<typeof ItemViewQuerystring>;

/** How the reader lays out pages: one at a time, or facing pairs (frame 8). */
export type ReaderLayout = 'single' | 'spread';

/** How an item is shown. */
export type ItemView = {
  readonly from: string | undefined;
  /** The page the reader opens at, for Library items. */
  readonly page: number;
  readonly layout: ReaderLayout;
  readonly isDetailsHidden: boolean;
  /** Viewing mode hides all chrome so the reference fills the screen (frame 9). */
  readonly isViewing: boolean;
  /**
   * The video time the player starts at, from Home's history (R35). It belongs to one opening,
   * so links to other items and pages leave it out.
   */
  readonly startSeconds: number | undefined;
};

/** Fills in the defaults: page 1 as a spread, details shown, chrome shown, video from 0:00. */
export function toItemView(params: ItemViewParams): ItemView {
  return {
    from: params.from,
    page: params.page ?? 1,
    layout: params.layout ?? 'spread',
    isDetailsHidden: params.details === 'hidden',
    isViewing: params.mode === 'viewing',
    startSeconds: params.t,
  };
}

/** The view settings other than the page, as query parameters; defaults are left out. */
export function viewParams(view: ItemView): URLSearchParams {
  const params = new URLSearchParams();
  if (view.from !== undefined) {
    params.set('from', view.from);
  }
  if (view.layout !== 'spread') {
    params.set('layout', view.layout);
  }
  if (view.isDetailsHidden) {
    params.set('details', 'hidden');
  }
  if (view.isViewing) {
    params.set('mode', 'viewing');
  }
  return params;
}

/** Links to an item with some view settings changed. Settings at their defaults are left out. */
export function itemPageHref(itemId: number, view: ItemView, changes: Partial<ItemView>): string {
  const next = { ...view, ...changes };
  const params = viewParams(next);
  if (next.page !== 1) {
    params.set('page', String(next.page));
  }
  const search = params.toString();
  return search === '' ? `/item/${String(itemId)}` : `/item/${String(itemId)}?${search}`;
}
