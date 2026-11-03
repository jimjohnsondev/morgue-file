import { describe, expect, it } from 'vitest';

import { PERF_ITEM_COUNT, planPerfItems } from '../../scripts/fixtures/perf-plan.ts';

describe('perf library plan', () => {
  it('makes 50,000 items with unique paths, the same on every run', () => {
    const items = planPerfItems();
    expect(items).toHaveLength(PERF_ITEM_COUNT);
    expect(new Set(items.map((item) => item.relPath)).size).toBe(PERF_ITEM_COUNT);
    expect(planPerfItems(100)).toEqual(items.slice(0, 100));
  });

  it('is mostly photos, with some videos and publications', () => {
    const items = planPerfItems();
    const images = items.filter((item) => item.kind === 'image').length;
    expect(images / items.length).toBeGreaterThan(0.9);
    expect(items.some((item) => item.kind === 'video')).toBe(true);
    expect(items.some((item) => item.kind === 'pdf')).toBe(true);
  });
});
