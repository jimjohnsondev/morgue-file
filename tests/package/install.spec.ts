// The release zip, installed and set up by following the README's Install and First run steps
// on a clean runner (R29, R30, R31). Run by build.yml on Windows; see playwright.package.config.ts.
import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  APP_URL,
  extractRelease,
  findReleaseZip,
  makeReferenceFolder,
  moveFolder,
  startMorgueFile,
  stopMorgueFile,
  TEMP_DIR,
  waitForApp,
  waitForExit,
} from './installed-app.js';

import type { Page } from '@playwright/test';

const REFERENCE_DIR = path.join(TEMP_DIR, 'Reference tést');

/** README First run steps 2–5, with the data choice the test asks for. */
async function completeSetup(page: Page, chosenDataDir?: string): Promise<void> {
  await page.goto(`${APP_URL}/`);
  await expect(page).toHaveURL(`${APP_URL}/setup`);
  await page.locator('#referenceDir').fill(REFERENCE_DIR);
  await page.locator('[data-setup-check="reference"]').click();
  await expect(page.locator('[data-setup-result="reference"]')).toContainText(
    'Found 1 file at the top level',
  );
  if (chosenDataDir !== undefined) {
    await page.getByLabel('Use a folder I choose').check();
    await page.locator('#chosenDataDir').fill(chosenDataDir);
    await page.locator('[data-setup-check="data"]').click();
    await expect(page.locator('[data-setup-result="data"]')).toContainText('can keep its data');
  }
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveTitle('Home · Morgue File');
}

/** Reads morgue-file.json from an install folder. */
async function readInstallFile(installDir: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(installDir, 'morgue-file.json'), 'utf8')) as unknown;
}

test('R29, R30, R31: the README steps work from a path with spaces, keeping data with the app', async ({
  page,
}) => {
  const installDir = await extractRelease(
    findReleaseZip(),
    path.join(TEMP_DIR, 'Morgue File tést'),
  );
  await makeReferenceFolder(REFERENCE_DIR);
  // The README's instructions travel in the zip, readable in any browser.
  expect(await readFile(path.join(installDir, 'README.html'), 'utf8')).toContain('First run');

  const server = startMorgueFile(installDir);
  await waitForApp();
  await completeSetup(page);
  expect(await readInstallFile(installDir)).toEqual({ dataDir: 'data' });
  expect((await stat(path.join(installDir, 'data', 'settings.json'))).isFile()).toBe(true);
  expect((await stat(path.join(REFERENCE_DIR, 'Inbox'))).isDirectory()).toBe(true);

  // A second double-click opens a tab in the running copy and closes straight away.
  const secondLaunch = startMorgueFile(installDir);
  expect(await waitForExit(secondLaunch)).toBe(0);
  await stopMorgueFile(server);

  // Setup is remembered: the next start goes straight to Home.
  const restarted = startMorgueFile(installDir);
  await waitForApp();
  await page.goto(`${APP_URL}/`);
  await expect(page).toHaveTitle('Home · Morgue File');
  await stopMorgueFile(restarted);

  // Moving the whole folder keeps the app and its data together.
  const movedParent = path.join(TEMP_DIR, 'Moved tést');
  await rm(movedParent, { recursive: true, force: true });
  await moveFolder(path.dirname(installDir), movedParent);
  const moved = startMorgueFile(path.join(movedParent, 'MorgueFile'));
  await waitForApp();
  await page.goto(`${APP_URL}/`);
  await expect(page).toHaveTitle('Home · Morgue File');
  await stopMorgueFile(moved);
});

test('R29, R30: the README steps work with a data folder the user chooses', async ({ page }) => {
  const installDir = await extractRelease(findReleaseZip(), path.join(TEMP_DIR, 'Chosen tést'));
  const chosenDataDir = path.join(TEMP_DIR, 'Morgue data tést');
  await makeReferenceFolder(REFERENCE_DIR);

  const server = startMorgueFile(installDir);
  await waitForApp();
  await completeSetup(page, chosenDataDir);
  expect(await readInstallFile(installDir)).toEqual({ dataDir: chosenDataDir });
  expect((await stat(path.join(chosenDataDir, 'settings.json'))).isFile()).toBe(true);
  await stopMorgueFile(server);
});
