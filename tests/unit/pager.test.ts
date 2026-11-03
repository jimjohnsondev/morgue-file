import { describe, expect, it } from 'vitest';

import { pagerSlots } from '#server/views/pager-slots.js';

/** Writes slots as the pager reads: 1 2 3 … 13. */
function asText(current: number, last: number): string {
  return pagerSlots(current, last)
    .map((slot) => (slot.kind === 'gap' ? '…' : String(slot.page)))
    .join(' ');
}

describe('pagerSlots', () => {
  it('shows frame 1: page 3 of 13', () => {
    expect(asText(3, 13)).toBe('1 2 3 4 5 … 13');
  });

  it('puts gaps on both sides in the middle of a long list', () => {
    expect(asText(500, 1042)).toBe('1 … 498 499 500 501 502 … 1042');
  });

  it('shows a lone page for a short list', () => {
    expect(asText(1, 1)).toBe('1');
  });
});
