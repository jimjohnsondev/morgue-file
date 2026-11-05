// The gate build's Item frames render from the fixture archive (build plan row 8): frames 5–9,
// with the design brief's sample content, and the keys that move through them (R19, R21).
import { expect, test } from '@playwright/test';

import type { Locator, Page } from '@playwright/test';

/** Opens an Index page and clicks the thumbnail with this label, as a visitor would. */
async function openFromIndex(page: Page, indexUrl: string, label: string): Promise<void> {
  await page.goto(indexUrl);
  await page.locator('.thumb-card', { hasText: label }).locator('a').first().click();
}

/**
 * Reloads until a part of the page shows some text. The server starts indexing as the tests
 * start, and an item's pixel size, length and page count arrive with its thumbnail job.
 */
async function reloadUntil(page: Page, locator: Locator, text: string): Promise<void> {
  await expect(async () => {
    await page.reload();
    await expect(locator).toContainText(text, { timeout: 1000 });
  }).toPass({ timeout: 120_000 });
}

test('R19: arrow keys move between items in the order of the Index you came from', async ({
  page,
}) => {
  await openFromIndex(page, '/photos/figure', 'seated_backlit_017.jpg');
  await expect(page.locator('.list-nav')).toContainText('3 of 1,236 in Figure');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.breadcrumb')).toContainText('figure_0004.jpg');
  await expect(page.locator('.list-nav')).toContainText('4 of 1,236 in Figure');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.breadcrumb')).toContainText('seated_backlit_017.jpg');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.breadcrumb')).toContainText('figure_0002.jpg');
});

test('R19: the arrow keys follow a search the item was opened from', async ({ page }) => {
  await openFromIndex(page, '/search?q=tag%3Ahands+model%3AElena', 'seated_backlit_017.jpg');
  await expect(page.locator('.list-nav')).toContainText('of 38 in search results');
  const before = await page.locator('.breadcrumb b').textContent();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.breadcrumb b')).not.toHaveText(before ?? '');
  await expect(page).toHaveURL(/from=tag%3Ahands\+model%3AElena/);
});

test('frame 5: a photo with its details panel open', async ({ page }) => {
  await openFromIndex(page, '/photos/figure', 'seated_backlit_017.jpg');
  await expect(page.locator('.breadcrumb')).toHaveText(
    'Home › Photos › Figure › seated_backlit_017.jpg',
  );
  const details = page.getByRole('complementary', { name: 'Details' });
  await reloadUntil(page, details, '4032×3024');
  await expect(details.getByLabel('4 of 5')).toHaveText('★★★★☆');
  await expect(details.locator('.chip')).toContainText([
    'back-lit',
    'hands',
    'seated',
    'Elena Varga',
    'Spring model session',
  ]);
  await expect(details).toContainText('example.com/seated-backlit');
  await page.getByRole('button', { name: '100%' }).click();
  const image = page.locator('[data-image-viewer]');
  expect((await image.boundingBox())?.width).toBe(4032);
  await page.keyboard.press('0');
  await expect(page.getByRole('button', { name: 'Fit' })).toHaveAttribute('aria-pressed', 'true');
});

test('frame 6: the details panel folds to an edge and opens again', async ({ page }) => {
  await openFromIndex(page, '/photos/figure', 'seated_backlit_017.jpg');
  await page.getByRole('link', { name: 'hide »' }).click();
  const edge = page.getByRole('complementary', { name: 'Details, hidden' });
  expect((await edge.boundingBox())?.width).toBe(34);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('complementary', { name: 'Details, hidden' })).toBeVisible();
  await page.getByRole('link', { name: 'Show details' }).click();
  await expect(page.getByRole('complementary', { name: 'Details' })).toBeVisible();
});

test('frame 7: a pose video plays, steps by frame and loops a range', async ({ page }) => {
  await openFromIndex(page, '/video/poses', 'pose_session_04_seated.mp4');
  await expect(page.locator('.list-nav')).toContainText('3 of 140 in Poses');
  const details = page.getByRole('complementary', { name: 'Details' });
  await reloadUntil(page, details, '1920×1080 · 30 fps');
  await expect(details).toContainText('3:15');
  const time = page.locator('[data-video-text="time"]');
  await expect(time).toContainText('/ 3:15.');
  await page.locator('[data-video-scrub]').fill('42');
  await page.getByRole('button', { name: 'Frame ›' }).click();
  await expect(page.locator('[data-video-text="frame"]')).toHaveText('frame 1,261');
  await page.getByRole('button', { name: 'Set in (I)' }).click();
  await page.locator('[data-video-scrub]').fill('60');
  await page.keyboard.press('o');
  await page.getByRole('button', { name: 'Loop off' }).click();
  await expect(page.locator('[data-video-loop]')).toBeVisible();
  await expect(page.locator('[data-video-text="loop-out"]')).toHaveText('1:00.00');
});

test('R21: frame 8, a magazine issue as a two-page spread', async ({ page }) => {
  await openFromIndex(page, '/library/magazines/life-drawing-quarterly', 'No. 12 · Winter 2023');
  await expect(page.locator('.list-nav')).toContainText('1 of 12 in Life Drawing Quarterly');
  await expect(page.locator('.breadcrumb')).toHaveText(
    'Home › Library › Magazines › Life Drawing Quarterly › No. 12 · Winter 2023',
  );
  await reloadUntil(page, page.locator('.reader-nav'), 'of 72');
  await page.getByLabel('Go to page').fill('12');
  await page.getByRole('button', { name: 'Go', exact: true }).last().click();
  await expect(page.locator('.reader-nav')).toContainText('Pages 12–13 of 72');
  await expect(page.locator('[data-reader]')).toHaveAttribute('data-drawn', 'true');
  await expect(page.locator('.page-strip__link')).toHaveCount(72);
  await expect(page.locator('.page-strip__link[aria-current="page"]')).toHaveCount(2);
  await page.keyboard.press('PageDown');
  await expect(page.locator('.reader-nav')).toContainText('Pages 14–15 of 72');
  await page.getByRole('link', { name: 'Single' }).click();
  await expect(page.locator('.reader-nav')).toContainText('Page 14 of 72');
});

test('R21: PDF pages keep their shape when half the viewer is narrower than a page', async ({
  page,
}) => {
  // A narrow window makes half the stage's width, not its height, the tighter limit. A page drawn
  // to fill the height and then clamped in width used to come out squashed sideways.
  await page.setViewportSize({ width: 1100, height: 1000 });
  await openFromIndex(page, '/library/magazines/life-drawing-quarterly', 'No. 12 · Winter 2023');
  await reloadUntil(page, page.locator('.reader-nav'), 'of 72');
  await expect(page.locator('[data-reader]')).toHaveAttribute('data-drawn', 'true');
  const pages = page.locator('.reader-stage canvas.reader-page');
  await expect(pages).toHaveCount(2);
  for (const canvas of await pages.all()) {
    const shape = await canvas.evaluate((element: HTMLCanvasElement) => {
      const box = element.getBoundingClientRect();
      const stage = element.closest<HTMLElement>('.reader-stage');
      const style = stage === null ? undefined : getComputedStyle(stage);
      const stageHeight =
        stage === null || style === undefined
          ? 0
          : stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      return {
        shown: box.width / box.height,
        drawn: element.width / element.height,
        height: box.height,
        stageHeight,
      };
    });
    // The half-width limit really is the tighter one here, so the bug would show.
    expect(shape.height).toBeLessThan(shape.stageHeight - 10);
    expect(shape.shown).toBeCloseTo(shape.drawn, 2);
  }
});

test('frame 9: in viewing mode a PDF spread grows to fill the taller viewer', async ({ page }) => {
  await openFromIndex(page, '/library/magazines/life-drawing-quarterly', 'No. 12 · Winter 2023');
  await reloadUntil(page, page.locator('.reader-nav'), 'of 72');
  const reader = page.locator('[data-reader]');
  await expect(reader).toHaveAttribute('data-drawn', 'true');
  const pageHeight = page.locator('.reader-stage canvas.reader-page').first();
  const before = await pageHeight.evaluate((element) => element.getBoundingClientRect().height);

  await page.keyboard.press('v');
  await expect(async () => {
    await expect(reader).toHaveAttribute('data-drawn', 'true', { timeout: 1000 });
    const sizes = await pageHeight.evaluate((element: HTMLCanvasElement) => {
      const stage = element.closest<HTMLElement>('.reader-stage');
      const style = stage === null ? undefined : getComputedStyle(stage);
      const inner =
        stage === null || style === undefined
          ? 0
          : stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      return { shown: element.getBoundingClientRect().height, inner };
    });
    expect(sizes.shown).toBeGreaterThan(before + 100);
    expect(Math.abs(sizes.shown - sizes.inner)).toBeLessThan(2);
  }).toPass({ timeout: 15_000 });
});

test('R21: a book of page scans shows its pages as pictures', async ({ page }) => {
  await page.goto('/search?q=type%3Acbz');
  await page.locator('.thumb-card a').first().click();
  await expect(page.locator('.reader-page').first()).toHaveJSProperty('complete', true);
  expect(
    await page
      .locator('.reader-page')
      .first()
      .evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBeGreaterThan(1);
});

test('frame 9: V hides all chrome, keeps it from item to item, and brings it back', async ({
  page,
}) => {
  await openFromIndex(page, '/photos/figure', 'seated_backlit_017.jpg');
  await page.keyboard.press('v');
  await expect(page.locator('.banner')).toBeHidden();
  await expect(page.locator('.viewing-hint')).toContainText('Press V to bring back the page');
  expect((await page.locator('.viewer-stage').boundingBox())?.height).toBe(
    page.viewportSize()?.height,
  );
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.breadcrumb')).toContainText('figure_0004.jpg');
  await expect(page.locator('.banner')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.banner')).toBeVisible();
});
