// R21 on the fixture archive: a 300-page PDF shows its first page in under 2 s. The fixture's
// longest PDF, "A Sketchbook of The Head" (318 pages), is opened on the shared e2e server with an
// empty browser cache each time, and timed from the start of the page load until pdf.js has drawn
// page 1 on the reader stage. Like the e2e specs on that server, it keeps its viewing-history
// writes in the page, so Home's seeded history stays as frame 12 draws it.
import { expect, test } from '../support/shared-server-test.js';

import type { Page } from '@playwright/test';

/** The budget for page 1 of a 300-page PDF to show (R21). */
const FIRST_PAGE_BUDGET_MS = 2000;
const RUNS = 5;

/** The fixture PDF with over 300 pages, as its card on the Books page names it. */
const LONG_PDF = 'A Sketchbook of The Head';

/** Where the page keeps the time page 1 was drawn, in ms since its navigation started. */
type TimedWindow = Window & { firstPageDrawnMs?: number };

/**
 * Runs in every page before its scripts: notes the moment the reader stage is first marked drawn.
 * Timing it in the page leaves out the test's own polling.
 */
function noteFirstPageDrawn(): void {
  new MutationObserver((changes, observer) => {
    for (const change of changes) {
      if (change.target instanceof HTMLElement && change.target.dataset.drawn === 'true') {
        (window as TimedWindow).firstPageDrawnMs = performance.now();
        observer.disconnect();
        return;
      }
    }
  }).observe(document, { attributes: true, attributeFilter: ['data-drawn'], subtree: true });
}

/**
 * Finds the long PDF's Item page and waits until its page count is known. The server starts
 * indexing as the tests start, and the count arrives with the PDF's thumbnail job.
 */
async function findLongPdf(page: Page): Promise<string> {
  await page.goto('/library/books');
  const href = await page
    .locator('.thumb-card', { hasText: LONG_PDF })
    .locator('a')
    .first()
    .getAttribute('href');
  expect(href).not.toBeNull();
  const itemUrl = href ?? '';
  await expect(async () => {
    await page.goto(itemUrl);
    await expect(page.locator('.reader-nav')).toContainText('of 318', { timeout: 1000 });
  }).toPass({ timeout: 120_000 });
  return itemUrl;
}

/** Opens the page with an empty cache and returns the milliseconds until page 1 was drawn. */
async function timeFirstPage(page: Page, itemUrl: string): Promise<number> {
  const session = await page.context().newCDPSession(page);
  await session.send('Network.clearBrowserCache');
  await session.detach();
  await page.goto(itemUrl, { waitUntil: 'commit' });
  await expect(page.locator('[data-reader]')).toHaveAttribute('data-drawn', 'true', {
    timeout: 10_000,
  });
  const drawnMs = await page.evaluate(() => (window as TimedWindow).firstPageDrawnMs);
  expect(drawnMs).toBeDefined();
  return drawnMs ?? Number.POSITIVE_INFINITY;
}

test('R21: a 300-page PDF shows its first page in under 2 s', async ({ page }) => {
  const itemUrl = await findLongPdf(page);
  await page.addInitScript(noteFirstPageDrawn);
  const times: number[] = [];
  for (let run = 0; run < RUNS; run++) {
    times.push(Math.round(await timeFirstPage(page, itemUrl)));
  }
  test.info().annotations.push({ type: 'first page (ms)', description: times.join(', ') });
  expect(Math.max(...times)).toBeLessThan(FIRST_PAGE_BUDGET_MS);
});
