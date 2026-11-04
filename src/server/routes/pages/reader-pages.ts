// Which pages the reader shows, and where its links lead (frame 8, R21). Spreads pair pages as a
// printed magazine does: the cover alone, then 2–3, 4–5 … so page 12 faces page 13.
import type { ReaderLayout } from './item-view.js';

/** The pages on show for a page, one at a time or as its spread. */
export function pagesOnShow(page: number, layout: ReaderLayout, pageCount: number): number[] {
  if (layout === 'single' || page === 1) {
    return [page];
  }
  const left = page % 2 === 0 ? page : page - 1;
  return [left, left + 1].filter((shown) => shown <= pageCount);
}

/** Where the reader's links go from the pages on show; undefined where there's nowhere to go. */
export type ReaderTargets = {
  readonly first: number | undefined;
  readonly previous: number | undefined;
  readonly next: number | undefined;
  readonly last: number | undefined;
};

/** The first, previous, next and last pages to link to. Each link opens that page's spread. */
export function readerTargets(shown: readonly number[], pageCount: number): ReaderTargets {
  const firstShown = shown[0] ?? 1;
  const lastShown = shown.at(-1) ?? firstShown;
  return {
    first: firstShown > 1 ? 1 : undefined,
    previous: firstShown > 1 ? firstShown - 1 : undefined,
    next: lastShown < pageCount ? lastShown + 1 : undefined,
    last: lastShown < pageCount ? pageCount : undefined,
  };
}
