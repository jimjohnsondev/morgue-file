// R22: the compare board. An Item page's "add to compare board" opens the board in a window of
// its own, the one window the app opens, and later items join it there. The board keeps its
// references and layout after its window is closed, so it opens as it was left.
import { setBoard } from '../support/compare-board.js';
import { expect, test } from '../support/shared-server-test.js';

import type { Page } from '@playwright/test';

// One board on the shared server: these tests take turns with it.
test.describe.configure({ mode: 'serial' });

/** Opens an Index page and clicks the thumbnail with this label, as a visitor would. */
async function openFromIndex(page: Page, indexUrl: string, label: string): Promise<void> {
  await page.goto(indexUrl);
  await page.locator('.thumb-card', { hasText: label }).locator('a').first().click();
}

/** Clicks an Item page's "add to compare board" and returns the board's window it opens. */
async function addAndOpenBoard(page: Page): Promise<Page> {
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'add to compare board' }).click();
  const board = await opened;
  await board.waitForLoadState();
  return board;
}

test('R22: an Item page opens the board in its own window, and the board keeps its layout', async ({
  page,
}) => {
  await setBoard(page, { itemIds: [], layout: 'row' });
  await openFromIndex(page, '/photos/figure', 'seated_backlit_017.jpg');
  const board = await addAndOpenBoard(page);
  await expect(board).toHaveURL(/\/compare$/);
  await expect(board.locator('[data-compare-item]')).toHaveCount(1);
  await expect(board.getByRole('img', { name: 'seated_backlit_017.jpg' })).toBeVisible();

  // The next item joins the window already open; no second window appears.
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.breadcrumb')).toContainText('figure_0004.jpg');
  await page.getByRole('button', { name: 'add to compare board' }).click();
  await expect(board.locator('[data-compare-item]')).toHaveCount(2);
  expect(page.context().pages()).toHaveLength(2);

  await board.getByRole('button', { name: '2 × 2 grid' }).click();
  await expect(board.locator('.compare-board__slots--grid')).toBeVisible();
  await board.close();

  // Opened again, the board is as it was left.
  const reopened = await addAndOpenBoard(page);
  await expect(reopened.locator('.compare-board__slots--grid')).toBeVisible();
  await expect(reopened.locator('figcaption')).toHaveText([
    /seated_backlit_017\.jpg/,
    /figure_0004\.jpg/,
  ]);
  await reopened.close();
});

test('R22: a reference is removed in place, and a full board says so', async ({ page }) => {
  await setBoard(page, { itemIds: [], layout: 'row' });
  for (const label of [
    'figure_0001.jpg',
    'figure_0002.jpg',
    'figure_0004.jpg',
    'figure_0005.jpg',
  ]) {
    await openFromIndex(page, '/photos/figure', label);
    const board = await addAndOpenBoard(page);
    await board.close();
  }
  await openFromIndex(page, '/photos/figure', 'seated_backlit_017.jpg');
  const board = await addAndOpenBoard(page);
  await expect(page.locator('[data-compare-result]')).toContainText('holds 4 references');
  await expect(board.getByRole('heading')).toContainText('4 of 4 references');

  await board.getByRole('button', { name: 'Remove figure_0002.jpg' }).click();
  await expect(board.locator('figcaption')).toHaveText([
    /figure_0001\.jpg/,
    /figure_0004\.jpg/,
    /figure_0005\.jpg/,
  ]);
  await board.close();
  await setBoard(page, { itemIds: [], layout: 'row' });
});
