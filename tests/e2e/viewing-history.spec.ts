// R35 in a browser: an item opened in the viewer is remembered with the video time or page it
// reached, and reopening it from Home's first strip lands there again. Runs on a small state
// server of its own, since it adds to the viewing history the shared server's Home draws.
import { expect, test } from '@playwright/test';

import { startStateServerProcess, stopStateServer } from '../support/state-server-process.js';

import type { StateServer } from '../support/state-server-process.js';
import type { Page, Response } from '@playwright/test';

/** A port of its own, apart from the shared server's and the other state servers'. */
const PORT = 47701;

let server: StateServer | undefined;

test.describe.configure({ mode: 'serial', timeout: 360_000 });

test.beforeAll(async () => {
  server = await startStateServerProcess('history', PORT);
});

test.afterAll(async () => {
  await stopStateServer(server);
});

/** Says whether a response answers a viewing-history write. */
function isViewWrite(response: Response): boolean {
  return response.request().method() === 'POST' && /\/api\/items\/\d+\/view$/.test(response.url());
}

/** Opens an item from an Index page and waits until its opening is recorded. */
async function openFromIndex(page: Page, indexPath: string, label: string): Promise<void> {
  await page.goto(`${server!.url}${indexPath}`);
  const card = page.locator('.thumb-card', { hasText: label }).locator('a').first();
  await Promise.all([page.waitForResponse(isViewWrite), card.click()]);
}

/** The first card of Home's Pick up where you left off, once it shows this text. */
async function firstPickUpCard(page: Page, text: string) {
  const card = page
    .getByRole('region', { name: 'Pick up where you left off' })
    .locator('.thumb-card')
    .first();
  // The video time is sent as the page is left, so Home may be drawn a moment before it lands.
  await expect(async () => {
    await page.goto(`${server!.url}/`);
    await expect(card).toContainText(text, { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  return card;
}

test('R35: reopening a video from Home lands at the same video time', async ({ page }) => {
  await openFromIndex(page, '/video/poses', 'pose_session_01_reclining.mp4');
  await expect(page.locator('[data-video-text="time"]')).toContainText('/ 0:02.');
  await page.locator('[data-video-scrub]').fill('1.25');
  await expect(page.locator('[data-video-text="time"]')).toContainText('0:01.25 /');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' }).click();

  const card = await firstPickUpCard(page, 'Video › Poses · at 0:01');
  await expect(card).toContainText('pose_session_01_reclining.mp4');
  await card.locator('a').first().click();
  await expect(page.locator('[data-video-text="time"]')).toContainText('0:01.25 /');
  const time = await page
    .locator('[data-video-player]')
    .evaluate((video: HTMLVideoElement) => video.currentTime);
  expect(time).toBeCloseTo(1.25, 2);
});

test('R35: reopening a Library item from Home lands at the same page', async ({ page }) => {
  await openFromIndex(page, '/library/books', 'Foreshortening');
  await page.getByLabel('Go to page').fill('4');
  await Promise.all([
    page.waitForResponse(isViewWrite),
    page.getByRole('button', { name: 'Go', exact: true }).last().click(),
  ]);
  await expect(page.locator('.reader-nav')).toContainText('Pages 4–5');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' }).click();

  const card = await firstPickUpCard(page, 'Library › Books · page 4');
  await card.locator('a').first().click();
  await expect(page.locator('.reader-nav')).toContainText('Pages 4–5');
});
