// Moving along a list keeps the scroll position: an Index page's page links and ← →, Prev and Next
// between items, and the reader's page links (R18, R19).
import { expect, test } from '../support/shared-server-test.js';

import type { Page } from '@playwright/test';

/** Scrolls the window to this many pixels down and waits until it's there. */
async function scrollTo(page: Page, top: number): Promise<void> {
  await page.evaluate((target) => {
    window.scrollTo(0, target);
  }, top);
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBe(top);
}

/** How far down the window is scrolled. */
async function scrollTop(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY);
}

test.use({ viewport: { width: 1280, height: 700 } });

test('R18: clicking a page number keeps the scroll position', async ({ page }) => {
  await page.goto('/photos/figure?page=3');
  await scrollTo(page, 600);
  await page.locator('.pager').first().getByRole('link', { name: '4', exact: true }).click();
  await expect(page.locator('.index-page__heading')).toContainText('page 4 of 13');
  expect(await scrollTop(page)).toBe(600);
});

test('R18: ← and → turn an Index page and keep the scroll position', async ({ page }) => {
  await page.goto('/photos/figure?page=3');
  await scrollTo(page, 500);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.index-page__heading')).toContainText('page 4 of 13');
  expect(await scrollTop(page)).toBe(500);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.index-page__heading')).toContainText('page 3 of 13');
  expect(await scrollTop(page)).toBe(500);
});

test('R19: moving to the next item with → keeps the scroll position', async ({ page }) => {
  await page.goto('/photos/figure');
  await page
    .locator('.thumb-card', { hasText: 'seated_backlit_017.jpg' })
    .locator('a')
    .first()
    .click();
  await expect(page.locator('.list-nav')).toContainText('3 of 1,236 in Figure');
  await scrollTo(page, 200);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.list-nav')).toContainText('4 of 1,236 in Figure');
  expect(await scrollTop(page)).toBe(200);
});

test('a page opened any other way starts at the top', async ({ page }) => {
  await page.goto('/photos/figure?page=3');
  await scrollTo(page, 600);
  await page.locator('.tab-bar').getByRole('link', { name: 'Video' }).click();
  await expect(page).toHaveURL(/\/video/);
  expect(await scrollTop(page)).toBe(0);
});
