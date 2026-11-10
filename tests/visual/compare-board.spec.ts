// The compare board (R22), which no frame draws: four Figure photos side by side and in the
// 2 × 2 grid, in a window at the size the board first opens at. Its baselines are approved in the
// PR that builds it, as the design brief says of the screens it leaves undesigned.
import { itemIdOf, setBoard } from '../support/compare-board.js';
import { freezeClock, openWhenSettled, SCREENSHOT_OPTIONS } from '../support/screenshots.js';
import { expect, test } from '../support/shared-server-test.js';

/** The shared server may still be making thumbnails when this runs first. */
test.describe.configure({ timeout: 660_000 });

/** The board's photos: frame 5's, then the first Figure photos of each shape. */
const PHOTOS = ['seated_backlit_017.jpg', 'figure_0001.jpg', 'figure_0002.jpg', 'figure_0004.jpg'];

test('compare board: four references side by side, then in a 2 × 2 grid', async ({ page }) => {
  await freezeClock(page);
  // The size client/compare.ts first opens the board's window at.
  await page.setViewportSize({ width: 1600, height: 1000 });
  const itemIds: number[] = [];
  for (const label of PHOTOS) {
    itemIds.push(await itemIdOf(page, '/photos/figure', label));
  }
  await setBoard(page, { itemIds, layout: 'row' });
  await openWhenSettled(page, '/compare');
  await expect(page.locator('[data-compare-item]')).toHaveCount(4);
  await expect(page).toHaveScreenshot('compare-board-side-by-side.png', SCREENSHOT_OPTIONS);

  await setBoard(page, { itemIds, layout: 'grid' });
  await openWhenSettled(page, '/compare');
  await expect(page).toHaveScreenshot('compare-board-grid.png', SCREENSHOT_OPTIONS);
});
