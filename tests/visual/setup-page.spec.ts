// The first-run setup page (R30), one screenshot per data choice. It isn't on the design canvas;
// it is built from the approved parts, and its baselines join the gate's baseline PR
// (docs/ARCHITECTURE.md, First-run setup).
import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  settlePointerAndFocus,
  freezeClock,
  SCREENSHOT_OPTIONS,
  waitForFontsAndImages,
} from '../support/screenshots.js';
import { expect, test } from '../support/shared-server-test.js';

import type { ChildProcess } from 'node:child_process';

const PORT = 47697;
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;

/** A fixed, empty home folder, so the page shows the same suggestions on every run. */
const HOME_DIR = path.join(os.tmpdir(), 'morgue-file-visual-setup');

/** Where the page suggests keeping data; set here so the runner's user name never shows. */
const LOCAL_APP_DATA = 'C:\\Users\\painter\\AppData\\Local';

let server: ChildProcess | undefined;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await rm(HOME_DIR, { recursive: true, force: true });
  await mkdir(HOME_DIR, { recursive: true });
  server = spawn(process.execPath, ['dist/server/main.js'], {
    env: {
      ...process.env,
      MORGUE_HOME: HOME_DIR,
      MORGUE_PORT: String(PORT),
      LOCALAPPDATA: LOCAL_APP_DATA,
    },
    stdio: 'ignore',
  });
  await expect(async () => {
    expect((await fetch(`${BASE_URL}/healthz`)).ok).toBe(true);
  }).toPass({ timeout: 60_000, intervals: [200] });
});

test.afterAll(async () => {
  if (server?.exitCode === null && server.signalCode === null) {
    const running = server;
    const exited = new Promise((resolve) => running.once('exit', resolve));
    running.kill();
    await exited;
  }
  await rm(HOME_DIR, { recursive: true, force: true });
});

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
  await page.goto(`${BASE_URL}/setup`);
  await waitForFontsAndImages(page);
});

test('R30: the setup page with Keep data with the app', async ({ page }) => {
  await expect(page).toHaveScreenshot('setup-keep-data-with-app.png', SCREENSHOT_OPTIONS);
});

test('R30: the setup page with Use a folder I choose', async ({ page }) => {
  await page.getByLabel('Use a folder I choose').check();
  await settlePointerAndFocus(page);
  await expect(page).toHaveScreenshot('setup-use-a-folder-i-choose.png', SCREENSHOT_OPTIONS);
});
