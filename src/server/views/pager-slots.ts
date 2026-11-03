// Which page numbers a pager shows: « Prev 1 2 3 4 5 … 13 Next » (frame 1).

/** A page number to link to, or a gap shown as an ellipsis. */
export type PagerSlot = { readonly kind: 'page'; readonly page: number } | { readonly kind: 'gap' };

/** How many pages either side of the current one are listed. */
const NEIGHBOURS = 2;

/**
 * Lists the first page, the last page, and the pages within two of the current one, with a gap
 * wherever numbers are skipped. Page 3 of 13 gives 1 2 3 4 5 … 13.
 */
export function pagerSlots(current: number, lastPage: number): PagerSlot[] {
  const pages: number[] = [];
  for (let page = 1; page <= lastPage; page++) {
    const isNear = Math.abs(page - current) <= NEIGHBOURS;
    if (page === 1 || page === lastPage || isNear) {
      pages.push(page);
    }
  }
  const slots: PagerSlot[] = [];
  for (const [index, page] of pages.entries()) {
    const previous = pages[index - 1];
    if (previous !== undefined && page - previous > 1) {
      slots.push({ kind: 'gap' });
    }
    slots.push({ kind: 'page', page });
  }
  return slots;
}
