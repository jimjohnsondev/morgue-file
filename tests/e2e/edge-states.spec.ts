// The edge states a browser reaches on the fixture archive (build plan row 10): a search with
// no results (E2), and the drop outline and its notice (E6). E1 and E3-E5 need a library in
// another state; tests/integration/edge-states.test.ts draws those. Dropping a file saves it, so
// drops are tested in ingest.spec.ts, on a server of their own.
import { expect, test } from '../support/shared-server-test.js';

import type { Page } from '@playwright/test';

/** Starts a drag of one file over the page, as Explorer does, and returns its data. */
async function startFileDrag(page: Page) {
  const dataTransfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(['not a picture'], 'hand_study.jpg', { type: 'image/jpeg' }));
    return data;
  });
  await page.dispatchEvent('main', 'dragenter', { dataTransfer });
  return dataTransfer;
}

test('E2: a search with no results links to the search without each term', async ({ page }) => {
  await page.goto('/search?q=tag%3Ahands+model%3ANobody');
  const grid = page.getByRole('region', { name: 'Items' });
  await expect(grid).toContainText('No items match.');
  await expect(grid).toContainText('Try the search without one of its parts:');
  await grid.getByRole('link', { name: 'without model:Nobody' }).click();
  await expect(page).toHaveURL('/search?q=tag%3Ahands');
  await expect(page.locator('.thumb-card').first()).toBeVisible();
});

test('E6: dragging a file over a page shows the outline until it leaves', async ({ page }) => {
  await page.goto('/photos/figure');
  const outline = page.locator('[data-drop-outline]');
  await expect(outline).toBeHidden();
  const dataTransfer = await startFileDrag(page);
  await expect(outline).toBeVisible();
  await expect(outline).toContainText('Drop to save to Unsorted');
  await page.dispatchEvent('main', 'dragleave', { dataTransfer });
  await expect(outline).toBeHidden();
});

test('E6: the Saved to Unsorted notice links to its item and is dismissed', async ({ page }) => {
  await page.goto('/unsorted');
  const firstCard = page.locator('.thumb-card__label').first();
  const name = await firstCard.textContent();
  const itemHref = await firstCard.getAttribute('href');
  const itemId = itemHref?.match(/^\/item\/(\d+)/)?.[1];
  expect(itemId).toBeDefined();

  await page.goto(`/photos/figure?saved=${String(itemId)}`);
  const notice = page.getByRole('status').filter({ hasText: 'Saved to Unsorted' });
  await expect(notice).toContainText(name ?? '');
  await expect(notice.getByRole('link', { name: 'Open the item' })).toHaveAttribute(
    'href',
    `/item/${String(itemId)}`,
  );
  await notice.getByRole('link', { name: 'Dismiss notice' }).click();
  await expect(page).toHaveURL('/photos/figure');
  await expect(page.getByText('Saved to Unsorted')).toHaveCount(0);
});
