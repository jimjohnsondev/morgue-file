// The design gate's built frames 1–12 (docs/DESIGN-BRIEF.md, Screens), captured from the shared
// server on the fixture archive. Jim compares them with the mocks; once approved they are the
// baseline every later PR is checked against.
import { expect, test } from '@playwright/test';

import {
  freezeClock,
  openWhenSettled,
  SCREENSHOT_OPTIONS,
  settlePointerAndFocus,
  waitForFontsAndImages,
} from '../support/screenshots.js';

import type { Page } from '@playwright/test';

/** The first test to run may wait minutes for the server to make every thumbnail. */
test.describe.configure({ timeout: 660_000 });

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

/** Opens an Index page once its thumbnails exist, then the item with this label from it. */
async function openFromIndex(page: Page, indexUrl: string, label: string): Promise<void> {
  await openWhenSettled(page, indexUrl);
  await page.locator('.thumb-card', { hasText: label }).locator('a').first().click();
  await waitForFontsAndImages(page);
  await settlePointerAndFocus(page);
}

/**
 * Waits until the reader's page strip has drawn every page scrolled into its view. The reader
 * draws those after the pages on show, as each one is seen, so `data-drawn` on the stage alone
 * can leave the strip half drawn when the screenshot is taken. The reader only draws strip pages
 * that are on screen, as frame 8's strip is.
 */
async function waitForPageStrip(page: Page): Promise<void> {
  await expect(async () => {
    const undrawn = await page.locator('.page-strip').evaluate((strip) => {
      const view = strip.getBoundingClientRect();
      return [...strip.querySelectorAll<HTMLCanvasElement>('canvas[data-pdf-page]')].filter(
        (canvas) => {
          const box = canvas.getBoundingClientRect();
          const isSeen = box.right > view.left && box.left < view.right;
          return isSeen && canvas.dataset.drawn !== 'true';
        },
      ).length;
    });
    expect(undrawn).toBe(0);
  }).toPass();
}

/** Moves the video to a time and waits until that frame is drawn. */
async function seekVideo(page: Page, seconds: number): Promise<void> {
  await page.locator('[data-video-scrub]').fill(String(seconds));
  await page.locator('[data-video-player]').evaluate(async (video: HTMLVideoElement) => {
    if (video.seeking) {
      await new Promise((resolve) => {
        video.addEventListener('seeked', resolve, { once: true });
      });
    }
  });
}

test('frame 1: Photos › Figure, page 3', async ({ page }) => {
  await openWhenSettled(page, '/photos/figure?page=3');
  await expect(page).toHaveScreenshot('frame-01-photos-figure-page-3.png', SCREENSHOT_OPTIONS);
});

test('frame 2: Library › Books', async ({ page }) => {
  await openWhenSettled(page, '/library/books');
  await expect(page).toHaveScreenshot('frame-02-library-books.png', SCREENSHOT_OPTIONS);
});

test('frame 3: Library › Magazines › Life Drawing Quarterly', async ({ page }) => {
  await openWhenSettled(page, '/library/magazines/life-drawing-quarterly');
  await expect(page).toHaveScreenshot('frame-03-life-drawing-quarterly.png', SCREENSHOT_OPTIONS);
});

test('frame 4: search results for tag:hands model:Elena', async ({ page }) => {
  await openWhenSettled(page, '/search?q=tag%3Ahands+model%3AElena');
  await expect(page).toHaveScreenshot('frame-04-search-results.png', SCREENSHOT_OPTIONS);
});

test('frame 5: a photo with its details panel open', async ({ page }) => {
  await openFromIndex(page, '/photos/figure', 'seated_backlit_017.jpg');
  await expect(page).toHaveScreenshot('frame-05-photo.png', SCREENSHOT_OPTIONS);
});

test('frame 6: the same photo with the panel folded', async ({ page }) => {
  await openFromIndex(page, '/photos/figure', 'seated_backlit_017.jpg');
  await page.getByRole('link', { name: 'hide »' }).click();
  await waitForFontsAndImages(page);
  await settlePointerAndFocus(page);
  await expect(page).toHaveScreenshot('frame-06-photo-panel-folded.png', SCREENSHOT_OPTIONS);
});

test('frame 7: a pose video with a loop range', async ({ page }) => {
  await openFromIndex(page, '/video/poses', 'pose_session_04_seated.mp4');
  await expect(page.locator('[data-video-text="time"]')).toContainText('/ 3:15.');
  await seekVideo(page, 58.5);
  await page.getByRole('button', { name: 'Set in (I)' }).click();
  await seekVideo(page, 93.6);
  await page.getByRole('button', { name: /^Set out/ }).click();
  await seekVideo(page, 42.12);
  await settlePointerAndFocus(page);
  await expect(page.locator('[data-video-text="frame"]')).toHaveText('frame 1,264');
  await expect(page).toHaveScreenshot('frame-07-pose-video.png', SCREENSHOT_OPTIONS);
});

test('frame 8: a magazine issue as a two-page spread', async ({ page }) => {
  await openFromIndex(page, '/library/magazines/life-drawing-quarterly', 'No. 12 · Winter 2023');
  await page.getByLabel('Go to page').fill('12');
  await page.getByRole('button', { name: 'Go', exact: true }).last().click();
  await expect(page.locator('.reader-nav')).toContainText('Pages 12–13 of 72');
  await expect(page.locator('[data-reader]')).toHaveAttribute('data-drawn', 'true');
  await waitForPageStrip(page);
  await settlePointerAndFocus(page);
  await waitForFontsAndImages(page);
  await expect(page).toHaveScreenshot('frame-08-magazine-spread.png', SCREENSHOT_OPTIONS);
});

test('frame 9: viewing mode', async ({ page }) => {
  await openFromIndex(page, '/photos/figure', 'seated_backlit_017.jpg');
  await page.keyboard.press('v');
  await expect(page.locator('.banner')).toBeHidden();
  await expect(page).toHaveScreenshot('frame-09-viewing-mode.png', SCREENSHOT_OPTIONS);
});

test('frame 10: Elena Varga', async ({ page }) => {
  await openWhenSettled(page, '/models/elena-varga');
  await expect(page).toHaveScreenshot('frame-10-elena-varga.png', SCREENSHOT_OPTIONS);
});

test('frame 11: frame 1 at 1280×800', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWhenSettled(page, '/photos/figure?page=3');
  await expect(page).toHaveScreenshot('frame-11-narrow-window.png', SCREENSHOT_OPTIONS);
});

test('frame 12: Home', async ({ page }) => {
  await openWhenSettled(page, '/?shuffle=1');
  await expect(page).toHaveScreenshot('frame-12-home.png', SCREENSHOT_OPTIONS);
});
