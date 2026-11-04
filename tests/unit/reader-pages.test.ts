import { describe, expect, it } from 'vitest';

import { pagesOnShow, readerTargets } from '#server/routes/pages/reader-pages.js';

describe('R21: single page or spread', () => {
  it('pairs pages as a printed magazine does, the cover alone', () => {
    expect(pagesOnShow(1, 'spread', 72)).toEqual([1]);
    expect(pagesOnShow(12, 'spread', 72)).toEqual([12, 13]);
    expect(pagesOnShow(13, 'spread', 72)).toEqual([12, 13]);
    expect(pagesOnShow(72, 'spread', 72)).toEqual([72]);
    expect(pagesOnShow(13, 'single', 72)).toEqual([13]);
  });

  it('links to the spreads either side, and to the ends', () => {
    expect(readerTargets([12, 13], 72)).toEqual({ first: 1, previous: 11, next: 14, last: 72 });
    expect(readerTargets([1], 72)).toEqual({
      first: undefined,
      previous: undefined,
      next: 2,
      last: 72,
    });
    expect(readerTargets([72], 72)).toMatchObject({ next: undefined, last: undefined });
  });
});
