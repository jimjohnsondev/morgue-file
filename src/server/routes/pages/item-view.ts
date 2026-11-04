// How an Item page is viewed: the list it was opened from, the reader's page and layout, whether
// the details panel is folded, and viewing mode. All of it lives in the URL, so Prev and Next,
// the page strip and the panel toggle are plain links that work with JavaScript off.
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
};

/** Fills in the defaults: page 1 as a spread, details shown, chrome shown. */
export function toItemView(params: ItemViewParams): ItemView {
  return {
    from: params.from,
    page: params.page ?? 1,
    layout: params.layout ?? 'spread',
    isDetailsHidden: params.details === 'hidden',
    isViewing: params.mode === 'viewing',
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
