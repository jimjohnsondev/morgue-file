// Moving along a list keeps the scroll position: an Index page's page links and ← →, Prev and Next
// between items, and the reader's page links (R18, R19).
import { expect, test } from '../support/shared-server-test.js';

import type { Locator, Page } from '@playwright/test';

/**
 * Reloads until a part of the page shows some text: a PDF's page count arrives with its thumbnail
 * job, which may not have run yet when the test starts (as in item-pages.spec.ts).
 */
async function reloadUntil(page: Page, locator: Locator, text: string): Promise<void> {
  await expect(async () => {
    await page.reload();
    await expect(locator).toContainText(text, { timeout: 1000 });
  }).toPass({ timeout: 120_000 });
}

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

/**
 * Waits for the page just opened to finish loading, scripts included, then for the window to
 * settle at this scroll position. Text shows before the scripts run, so it isn't enough.
 */
async function expectScrolledTo(page: Page, top: number): Promise<void> {
  await page.waitForLoadState('load');
  await expect.poll(async () => scrollTop(page)).toBe(top);
}

test.use({ viewport: { width: 1280, height: 700 } });

test('R18: clicking a page number keeps the scroll position', async ({ page }) => {
  await page.goto('/photos/figure?page=3');
  await scrollTo(page, 600);
  await page.locator('.pager').first().getByRole('link', { name: '4', exact: true }).click();
  await expect(page.locator('.index-page__heading')).toContainText('page 4 of 13');
  await expectScrolledTo(page, 600);
});

test('R18: ← and → turn an Index page and keep the scroll position', async ({ page }) => {
  await page.goto('/photos/figure?page=3');
  await page.waitForLoadState('load');
  await scrollTo(page, 500);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.index-page__heading')).toContainText('page 4 of 13');
  await expectScrolledTo(page, 500);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.index-page__heading')).toContainText('page 3 of 13');
  await expectScrolledTo(page, 500);
});

test('R19: moving to the next item with → keeps the scroll position', async ({ page }) => {
  await page.goto('/photos/figure');
  await page
    .locator('.thumb-card', { hasText: 'seated_backlit_017.jpg' })
    .locator('a')
    .first()
    .click();
  await expect(page.locator('.list-nav')).toContainText('3 of 1,236 in Figure');
  await page.waitForLoadState('load');
  await scrollTo(page, 200);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.list-nav')).toContainText('4 of 1,236 in Figure');
  await expectScrolledTo(page, 200);
});

test('a page opened any other way starts at the top', async ({ page }) => {
  await page.goto('/photos/figure?page=3');
  await scrollTo(page, 600);
  await page.locator('.tab-bar').getByRole('link', { name: 'Video' }).click();
  await expect(page).toHaveURL(/\/video/);
  await expectScrolledTo(page, 0);
});

test('R19: turning a PDF’s pages with → or Go to page keeps the scroll position', async ({
  page,
}) => {
  await page.goto('/library/magazines/life-drawing-quarterly');
  await page
    .locator('.thumb-card', { hasText: 'No. 12 · Winter 2023' })
    .locator('a')
    .first()
    .click();
  const nav = page.locator('.reader-nav');
  await reloadUntil(page, nav, 'of 72');
  await page.waitForLoadState('load');
  await scrollTo(page, 250);
  await page.keyboard.press('ArrowRight');
  await expect(nav).toContainText('Pages 2–3 of 72');
  await expectScrolledTo(page, 250);

  // Filling the field mustn't scroll the page: the toolbar is on screen at this position.
  await page.getByLabel('Go to page').fill('12');
  expect(await scrollTop(page)).toBe(250);
  await page.getByRole('button', { name: 'Go', exact: true }).last().click();
  await expect(nav).toContainText('Pages 12–13 of 72');
  await expectScrolledTo(page, 250);
});

test('R18: while items are being selected, ← and → leave the Index page alone', async ({
  page,
}) => {
  await page.goto('/photos/figure?page=3&select=on');
  await page.waitForLoadState('load');
  // A key the page handles is marked handled; one it leaves alone isn't.
  const isHandled = await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(isHandled).toBe(false);
  await expect(page.locator('.index-page__heading')).toContainText('page 3 of 13');
});
