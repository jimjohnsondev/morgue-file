// R1 in a browser: a file added to the Reference folder while the app runs shows on its page
// within 5 s, with no restart and no rescan by hand. Runs on a small state server of its own,
// since it adds files to the archive the server watches.
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '../support/shared-server-test.js';
import { startStateServerProcess, stopStateServer } from '../support/state-server-process.js';

import type { StateServer } from '../support/state-server-process.js';

/** A port of its own, apart from the shared server's and the visual specs' state servers. */
const PORT = 47697;

/** The state server's Reference folder (see tests/support/start-state-server.ts). */
const REFERENCE_DIR = path.join(os.tmpdir(), 'morgue-file-state-watching', 'Reference');

/** R1's limit for a new file to show. */
const R1_LIMIT_MS = 5000;

let server: StateServer | undefined;

test.describe.configure({ mode: 'serial', timeout: 360_000 });

test.beforeAll(async () => {
  server = await startStateServerProcess('watching', PORT);
});

test.afterAll(async () => {
  await stopStateServer(server);
});

test('R1: a file added to a watched folder appears within 5 s', async ({ page }) => {
  await page.goto(`${server!.url}/unsorted`);
  await expect(page.getByText('Nothing waiting to be filed.')).toBeVisible();
  const photo = (await readdir(path.join(REFERENCE_DIR, 'Figure'))).sort()[0]!;
  await mkdir(path.join(REFERENCE_DIR, 'Inbox'), { recursive: true });
  const started = Date.now();
  await copyFile(
    path.join(REFERENCE_DIR, 'Figure', photo),
    path.join(REFERENCE_DIR, 'Inbox', 'watched_001.jpg'),
  );
  await expect(async () => {
    await page.reload();
    await expect(page.locator('.thumb-card__label')).toContainText(['watched_001'], {
      timeout: 100,
    });
  }).toPass({ timeout: R1_LIMIT_MS, intervals: [100] });
  expect(Date.now() - started).toBeLessThan(R1_LIMIT_MS);
});

test('pages follow /events for the live notices', async ({ page }) => {
  const opened = page.waitForRequest((request) => request.url().endsWith('/events'));
  await page.goto(`${server!.url}/photos`);
  const request = await opened;
  expect((await request.response())?.status()).toBe(200);
});

test('eight open tabs share one /events stream, so every tab still loads', async ({ context }) => {
  let streams = 0;
  context.on('request', (request) => {
    if (request.url().endsWith('/events')) {
      streams += 1;
    }
  });
  const pages = [];
  for (let index = 0; index < 8; index += 1) {
    const page = await context.newPage();
    await page.goto(`${server!.url}/photos/figure`, { timeout: 10_000 });
    pages.push(page);
  }
  expect(streams).toBe(1);
  // A further page load in the last tab still finds a free connection.
  await pages[7]!.goto(`${server!.url}/library/books`, { timeout: 10_000 });
  await expect(pages[7]!.locator('.thumb-card').first()).toBeVisible();
});
