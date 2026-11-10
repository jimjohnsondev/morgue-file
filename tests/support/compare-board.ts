// What the compare board specs share (R22): finding a fixture item's id from its Index page, and
// putting the shared server's board in a known state through its API, as the board's own page does.
import type { Page } from '@playwright/test';

/** The id of the item an Index page lists under this name, read from its card's link. */
export async function itemIdOf(page: Page, indexUrl: string, label: string): Promise<number> {
  await page.goto(indexUrl);
  const href = await page
    .locator('.thumb-card', { hasText: label })
    .locator('a')
    .first()
    .getAttribute('href');
  const id = /^\/item\/(\d+)/.exec(href ?? '')?.[1];
  if (id === undefined) {
    throw new Error(`No item called ${label} on ${indexUrl}.`);
  }
  return Number(id);
}

/** The board as a spec wants it: these items in this order, laid out this way. */
type BoardState = { readonly itemIds: readonly number[]; readonly layout: 'row' | 'grid' };

/**
 * Empties the shared server's board, then puts these items on it in order and sets its layout,
 * with the launch token from the page as the board's own forms send it.
 */
export async function setBoard(page: Page, state: BoardState): Promise<void> {
  await page.goto('/compare');
  await page.evaluate(async ({ itemIds, layout }) => {
    const token = document.querySelector<HTMLMetaElement>('meta[name="morgue-token"]')?.content;
    const headers = { 'x-morgue-token': token ?? '', 'content-type': 'application/json' };
    const onBoard = [...document.querySelectorAll<HTMLElement>('[data-compare-item]')];
    for (const slot of onBoard) {
      await fetch(`/api/compare/items/${slot.dataset.compareItem ?? ''}`, {
        method: 'DELETE',
        headers: { 'x-morgue-token': token ?? '' },
      });
    }
    for (const itemId of itemIds) {
      await fetch('/api/compare/items', {
        method: 'POST',
        headers,
        body: JSON.stringify({ itemId }),
      });
    }
    await fetch('/api/compare/layout', {
      method: 'POST',
      headers,
      body: JSON.stringify({ layout }),
    });
  }, state);
}
