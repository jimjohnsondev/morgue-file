// First-run setup in a real browser (R30): a fresh install opens /setup, checks both folders,
// saves, and lands on Home. Each test starts its own server on an empty home folder.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '../support/shared-server-test.js';

import type { ChildProcess } from 'node:child_process';

// One port per test, kept apart from the shared server's 47690.
const PORTS = { withApp: 47691, chosen: 47692 } as const;

type FreshInstall = {
  readonly rootDir: string;
  readonly homeDir: string;
  readonly referenceDir: string;
  readonly server: ChildProcess;
  readonly url: string;
};

/** Waits until the server answers its health check. */
async function waitForServer(url: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(`${url}/healthz`)).ok) {
        return;
      }
    } catch {
      // Not listening yet; try again shortly.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`The server at ${url} didn't start.`);
}

/** Makes an empty home folder and a Reference folder, and starts the built server on them. */
async function startFreshInstall(port: number): Promise<FreshInstall> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-setup-'));
  const homeDir = path.join(rootDir, 'Morgue File tést');
  const referenceDir = path.join(rootDir, 'Reference tést');
  await mkdir(homeDir);
  await mkdir(referenceDir);
  await writeFile(path.join(referenceDir, 'placeholder.txt'), 'Not a real reference file.');
  const server = spawn(process.execPath, ['dist/server/main.js'], {
    env: { ...process.env, MORGUE_HOME: homeDir, MORGUE_PORT: String(port) },
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${String(port)}`;
  await waitForServer(url);
  return { rootDir, homeDir, referenceDir, server, url };
}

/** Stops the server and removes its folders. */
async function removeFreshInstall(install: FreshInstall): Promise<void> {
  install.server.kill();
  await new Promise((resolve) => install.server.once('exit', resolve));
  await rm(install.rootDir, { recursive: true, force: true });
}

test('R30: setup with Keep data with the app checks the folder and opens Home', async ({
  page,
}) => {
  const install = await startFreshInstall(PORTS.withApp);
  try {
    await page.goto(`${install.url}/`);
    await expect(page).toHaveURL(`${install.url}/setup`);

    await page.locator('#referenceDir').fill(path.join(install.rootDir, 'Nowhere'));
    await page.locator('[data-setup-check="reference"]').click();
    await expect(page.locator('[data-setup-result="reference"]')).toContainText(
      'There is no folder at',
    );

    await page.locator('#referenceDir').fill(install.referenceDir);
    await page.locator('[data-setup-check="reference"]').click();
    await expect(page.locator('[data-setup-result="reference"]')).toContainText(
      'Found 1 file at the top level',
    );

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page).toHaveTitle('Home · Morgue File');
    const installFile = await readFile(path.join(install.homeDir, 'morgue-file.json'), 'utf8');
    expect(JSON.parse(installFile)).toEqual({ dataDir: 'data' });
  } finally {
    await removeFreshInstall(install);
  }
});

test('R30: setup with Use a folder I choose keeps the data there', async ({ page }) => {
  const install = await startFreshInstall(PORTS.chosen);
  const chosen = path.join(install.rootDir, 'Morgue data tést');
  try {
    await page.goto(`${install.url}/setup`);
    await page.locator('#referenceDir').fill(install.referenceDir);
    await page.getByLabel('Use a folder I choose').check();
    await page.locator('#chosenDataDir').fill(chosen);
    await page.locator('[data-setup-check="data"]').click();
    await expect(page.locator('[data-setup-result="data"]')).toContainText(
      'Morgue File can keep its data in',
    );

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page).toHaveTitle('Home · Morgue File');
    const settings = await readFile(path.join(chosen, 'settings.json'), 'utf8');
    expect(JSON.parse(settings)).toMatchObject({ port: PORTS.chosen });
  } finally {
    await removeFreshInstall(install);
  }
});
