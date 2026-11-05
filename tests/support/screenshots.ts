// What every screenshot spec does before it captures a page, so the same screen always gives the
// same pixels (docs/ARCHITECTURE.md, Stable screenshots): a frozen clock, every thumbnail made,
// fonts and images loaded, and no caret or animation.
import { expect } from '@playwright/test';

import type { Page } from '@playwright/test';

/** The day the mocks were settled; the browser's clock stays on it. */
const FROZEN_TIME = new Date('2026-10-31T12:00:00.000Z');

/** How long a page may take to get every thumbnail while the server is still making them. */
const THUMBNAIL_WAIT_MS = 600_000;

/** The options every screenshot is taken with. */
export const SCREENSHOT_OPTIONS = { animations: 'disabled', caret: 'hide' } as const;

/** Stops the browser's clock at the mocks' day. Call before the first page is opened. */
export async function freezeClock(page: Page): Promise<void> {
  await page.clock.setFixedTime(FROZEN_TIME);
}

/** Takes focus off whatever was last clicked, so no focus ring shows in the capture. */
export async function blurFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
}

/** Waits for the page's fonts and for every image on it to finish loading or fail. */
export async function waitForFontsAndImages(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const pending = [...document.images].filter((image) => !image.complete);
    await Promise.all(
      pending.map(
        (image) =>
          new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
          }),
      ),
    );
  });
}

/** Says whether every thumbnail on the page is a real one, not the 1 px stand-in. */
async function hasEveryThumbnail(page: Page): Promise<boolean> {
  await waitForFontsAndImages(page);
  return page
    .locator('img[data-thumb]')
    .evaluateAll((images: HTMLImageElement[]) => images.every((image) => image.naturalWidth > 1));
}

/**
 * Opens a page and reloads it until every thumbnail on it has been made. The shared server
 * indexes as the tests start, and an item's details arrive with its thumbnail.
 */
export async function openWhenThumbnailsExist(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(async () => {
    await page.reload();
    expect(await hasEveryThumbnail(page)).toBe(true);
  }).toPass({ timeout: THUMBNAIL_WAIT_MS, intervals: [2000] });
}
