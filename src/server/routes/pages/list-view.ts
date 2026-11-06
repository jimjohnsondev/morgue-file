// How an Index page is viewed: which page, how many thumbnails per page, at which size, and
// whether the filter panel is open or items are being selected (frame 13). All of it lives in
// the URL, so every view is a plain link
// that works with JavaScript off.
import { Type } from '@sinclair/typebox';

import type { SquareSizeName } from '#core/jobs/thumbnail-files.js';
import type { Static } from '@sinclair/typebox';

/** Thumbnails per page: 96 by default, 48 or 192 by choice (design brief). */
export type PerPage = 48 | 96 | 192;

/** The per-page choices, in the order the toolbar lists them. */
export const PER_PAGE_CHOICES: readonly PerPage[] = [48, 96, 192];

/** The thumbnail sizes, in the order the toolbar lists them. */
export const SIZE_CHOICES: readonly SquareSizeName[] = ['small', 'medium', 'large'];

/** The query-string parameters every Index page takes. */
export const ListViewQuerystring = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  per: Type.Optional(Type.Union([Type.Literal(48), Type.Literal(96), Type.Literal(192)])),
  size: Type.Optional(
    Type.Union([Type.Literal('small'), Type.Literal('medium'), Type.Literal('large')]),
  ),
  filters: Type.Optional(Type.Union([Type.Literal('shown'), Type.Literal('hidden')])),
  select: Type.Optional(Type.Literal('on')),
});

/** The parsed query string of an Index page. */
export type ListViewParams = Static<typeof ListViewQuerystring>;

/** How a list is shown. */
export type ListView = {
  readonly page: number;
  readonly perPage: PerPage;
  readonly size: SquareSizeName;
  /** Whether the filter panel is open; undefined means the page's own default. */
  readonly filters: 'shown' | 'hidden' | undefined;
  /** Whether the page is in selection mode, with tick boxes and the action panel (frame 13). */
  readonly isSelecting: boolean;
};

/** Fills in the defaults: page 1, 96 per page, Medium thumbnails. */
export function toListView(params: ListViewParams): ListView {
  return {
    page: params.page ?? 1,
    perPage: params.per ?? 96,
    size: params.size ?? 'medium',
    filters: params.filters,
    isSelecting: params.select === 'on',
  };
}

/** Where a list lives: its path, and the query it shows if that isn't implied by the path. */
export type ListAddress = {
  readonly path: string;
  /** The canonical query, for /search; other pages imply theirs. */
  readonly q?: string;
};

/**
 * Links to a list with some view settings changed. Settings at their defaults are left out,
 * so the plain page is always just its path.
 */
export function listHref(address: ListAddress, view: ListView, changes: Partial<ListView>): string {
  const next = { ...view, ...changes };
  const params = new URLSearchParams();
  if (address.q !== undefined) {
    params.set('q', address.q);
  }
  if (next.page !== 1) {
    params.set('page', String(next.page));
  }
  if (next.perPage !== 96) {
    params.set('per', String(next.perPage));
  }
  if (next.size !== 'medium') {
    params.set('size', next.size);
  }
  if (next.filters !== undefined) {
    params.set('filters', next.filters);
  }
  if (next.isSelecting) {
    params.set('select', 'on');
  }
  const search = params.toString();
  return search === '' ? address.path : `${address.path}?${search}`;
}
