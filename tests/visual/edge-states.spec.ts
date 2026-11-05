// The design gate's edge states E1–E6 (docs/DESIGN-BRIEF.md, Edge states). E2 and E6 are
// captured on the shared server; E1 and E3–E5 each need a library in another state, so they
// start a small server of their own (tests/support/start-state-server.ts).
import { spawn } from 'node:child_process';

import { expect, test } from '@playwright/test';

import {
  freezeClock,
  openWhenThumbnailsExist,
  SCREENSHOT_OPTIONS,
  waitForFontsAndImages,
} from '../support/screenshots.js';

import type { Page } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';

/** One port per state server, kept apart from the shared server's and the other specs'. */
const STATE_PORTS = { 'empty-unsorted': 47694, offline: 47695, indexing: 47696 } as const;
type State = keyof typeof STATE_PORTS;

/** How long a state server may take to index its copy and make its thumbnails. */
const STATE_SERVER_WAIT_MS = 240_000;

/** A state server and the address it answers on. */
type StateServer = { readonly process: ChildProcess; readonly url: string };

test.describe.configure({ timeout: 660_000 });

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

/** Waits until a server answers its health check; state servers listen only once ready. */
async function waitForServer(url: string): Promise<void> {
  await expect(async () => {
    expect((await fetch(`${url}/healthz`)).ok).toBe(true);
  }).toPass({ timeout: STATE_SERVER_WAIT_MS, intervals: [500] });
}

/** Starts a state server and waits for it. */
async function startStateServer(state: State): Promise<StateServer> {
  const port = STATE_PORTS[state];
  const child = spawn(process.execPath, ['tests/support/start-state-server.ts'], {
    env: { ...process.env, MORGUE_STATE: state, MORGUE_PORT: String(port) },
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${String(port)}`;
  await waitForServer(url);
  return { process: child, url };
}

/** Stops a state server and waits for it to exit. */
async function stopStateServer(server: StateServer | undefined): Promise<void> {
  if (server?.process.exitCode !== null) {
    return;
  }
  const exited = new Promise((resolve) => server.process.once('exit', resolve));
  server.process.kill();
  await exited;
}

/** Starts a drag of one file over the page, as Explorer does. */
async function startFileDrag(page: Page): Promise<void> {
  const dataTransfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(['not a picture'], 'hand_study.jpg', { type: 'image/jpeg' }));
    return data;
  });
  await page.dispatchEvent('main', 'dragenter', { dataTransfer });
}

test('E2: a search with no results', async ({ page }) => {
  await page.goto('/search?q=tag%3Ahands+model%3ANobody');
  await waitForFontsAndImages(page);
  await expect(page).toHaveScreenshot('e2-search-no-results.png', SCREENSHOT_OPTIONS);
});

test('E6: the outline while a file is dragged over the page', async ({ page }) => {
  await openWhenThumbnailsExist(page, '/photos/figure');
  await startFileDrag(page);
  await expect(page.locator('[data-drop-outline]')).toBeVisible();
  await expect(page).toHaveScreenshot('e6-drop-outline.png', SCREENSHOT_OPTIONS);
});

test('E6: the Saved to Unsorted notice after a drop', async ({ page }) => {
  await page.goto('/unsorted');
  const itemHref = await page.locator('.thumb-card__label').first().getAttribute('href');
  const itemId = itemHref?.match(/^\/item\/(\d+)/)?.[1];
  expect(itemId).toBeDefined();
  await openWhenThumbnailsExist(page, `/photos/figure?saved=${String(itemId)}`);
  await expect(page.getByRole('status').filter({ hasText: 'Saved to Unsorted' })).toBeVisible();
  await expect(page).toHaveScreenshot('e6-saved-notice.png', SCREENSHOT_OPTIONS);
});

test.describe('E1: empty Unsorted', () => {
  test.describe.configure({ mode: 'serial' });
  let server: StateServer | undefined;
  test.beforeAll(async () => {
    server = await startStateServer('empty-unsorted');
  });
  test.afterAll(async () => {
    await stopStateServer(server);
  });

  test('E1: nothing waiting to be filed', async ({ page }) => {
    await page.goto(`${String(server?.url)}/unsorted`);
    await waitForFontsAndImages(page);
    await expect(page.getByText('Nothing waiting to be filed.')).toBeVisible();
    await expect(page).toHaveScreenshot('e1-empty-unsorted.png', SCREENSHOT_OPTIONS);
  });
});

test.describe('E3 and E4: the Reference folder offline', () => {
  test.describe.configure({ mode: 'serial' });
  let server: StateServer | undefined;
  test.beforeAll(async () => {
    server = await startStateServer('offline');
  });
  test.afterAll(async () => {
    await stopStateServer(server);
  });

  test('E3: the offline band above a page whose thumbnails still show', async ({ page }) => {
    await openWhenThumbnailsExist(page, `${String(server?.url)}/photos/figure`);
    await expect(page.getByText('Reference folder (E:\\Reference) is offline.')).toBeVisible();
    await expect(page).toHaveScreenshot('e3-drive-offline.png', SCREENSHOT_OPTIONS);
  });

  test('E4: an original that can’t be opened shows its thumbnail enlarged', async ({ page }) => {
    await openWhenThumbnailsExist(page, `${String(server?.url)}/photos/figure`);
    await page.locator('.thumb-card a').first().click();
    await waitForFontsAndImages(page);
    await expect(page.getByText('The original can’t be opened right now.')).toBeVisible();
    await expect(page).toHaveScreenshot('e4-original-missing.png', SCREENSHOT_OPTIONS);
  });
});

test.describe('E5: the first index running', () => {
  test.describe.configure({ mode: 'serial' });
  let server: StateServer | undefined;
  test.beforeAll(async () => {
    server = await startStateServer('indexing');
  });
  test.afterAll(async () => {
    await stopStateServer(server);
  });

  test('E5: the slim bar under the nav and the footer counters', async ({ page }) => {
    await openWhenThumbnailsExist(page, `${String(server?.url)}/photos/figure`);
    const bar = page.locator('.status-band--indexing');
    await expect(bar).toContainText('12,400');
    await expect(bar).toHaveScreenshot('e5-indexing-bar.png', SCREENSHOT_OPTIONS);
    await expect(page.locator('.footer')).toHaveScreenshot(
      'e5-indexing-footer.png',
      SCREENSHOT_OPTIONS,
    );
  });
});
