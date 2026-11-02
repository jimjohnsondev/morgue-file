import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadInstallState } from '#server/install/install-state.js';
import { isMorgueFileAt, launch } from '#server/launch.js';
import { runServer } from '#server/run.js';

import { makeTempInstall } from '../support/temp-install.js';

import type { RunningServer } from '#server/run.js';
import type { TempInstall } from '../support/temp-install.js';
import type { Server } from 'node:net';

// Kept away from the default range and the Playwright port, so a running copy can't interfere.
const SAVED_PORT = 47695;
const BUSY_PORT = 47696;
const FREE_PORT = 47697;

let install: TempInstall;
const toStop: RunningServer[] = [];
const blockers: Server[] = [];

beforeEach(async () => {
  install = await makeTempInstall();
});

afterEach(async () => {
  for (const server of toStop.splice(0)) {
    await server.stop();
  }
  for (const blocker of blockers.splice(0)) {
    blocker.close();
  }
  await install.remove();
});

/** Sets the install up as setup would, with the data beside the app and a saved port. */
async function setUpWithDataBesideApp(homeDir: string, port: number): Promise<string> {
  const dataDir = path.join(homeDir, 'data');
  await mkdir(dataDir);
  await writeFile(path.join(homeDir, 'morgue-file.json'), JSON.stringify({ dataDir: 'data' }));
  const settings = { port, referenceDir: path.join('..', 'Reference tést') };
  await writeFile(path.join(dataDir, 'settings.json'), JSON.stringify(settings));
  return dataDir;
}

/** Adds the Reference folder's absolute path to settings.json, as setup saves it. */
async function writeAbsoluteReference(homeDir: string, referenceDir: string): Promise<void> {
  const settingsPath = path.join(homeDir, 'data', 'settings.json');
  const settings = JSON.parse(await readFile(settingsPath, 'utf8')) as Record<string, unknown>;
  await writeFile(
    settingsPath,
    JSON.stringify({ ...settings, referenceDirAbsolute: referenceDir }),
  );
}

/** Holds a port with a plain TCP server, the way another program would. */
async function occupyPort(port: number): Promise<void> {
  const blocker = createServer();
  await new Promise<void>((resolve) => blocker.listen(port, '127.0.0.1', resolve));
  blockers.push(blocker);
}

describe('R29: starting from the shortcut', () => {
  it('R29: starts the server on the saved port and opens it in the browser', async () => {
    await setUpWithDataBesideApp(install.homeDir, SAVED_PORT);
    const opened: string[] = [];
    const result = await launch({
      config: install.config,
      logger: false,
      openUrl: (url) => opened.push(url),
    });
    if (result.server !== undefined) {
      toStop.push(result.server);
    }
    expect(result.server?.port).toBe(SAVED_PORT);
    expect(opened).toEqual([`http://127.0.0.1:${String(SAVED_PORT)}/`]);
    expect(await isMorgueFileAt(SAVED_PORT)).toBe(true);
  });

  it('R29: a second launch just opens a tab in the copy that is running', async () => {
    const dataDir = await setUpWithDataBesideApp(install.homeDir, SAVED_PORT);
    const first = await launch({ config: install.config, logger: false, openUrl: () => undefined });
    if (first.server !== undefined) {
      toStop.push(first.server);
    }
    const lock = JSON.parse(await readFile(path.join(dataDir, 'morgue-file.lock'), 'utf8')) as {
      port: number;
    };
    expect(lock.port).toBe(SAVED_PORT);

    const opened: string[] = [];
    const second = await launch({
      config: install.config,
      logger: false,
      openUrl: (url) => opened.push(url),
    });
    expect(second.server).toBeUndefined();
    expect(opened).toEqual([`http://127.0.0.1:${String(SAVED_PORT)}/`]);
  });

  it('R29: moves to the next free port when another program holds one, and saves it', async () => {
    const dataDir = await setUpWithDataBesideApp(install.homeDir, BUSY_PORT);
    await occupyPort(BUSY_PORT);
    const server = await runServer({
      config: install.config,
      install: { current: await loadInstallState(install.homeDir) },
      ports: [BUSY_PORT, FREE_PORT],
      logger: false,
    });
    toStop.push(server);
    expect(server.port).toBe(FREE_PORT);
    const settings = JSON.parse(await readFile(path.join(dataDir, 'settings.json'), 'utf8')) as {
      port: number;
    };
    expect(settings.port).toBe(FREE_PORT);
  });

  it('R29: with the default data folder, the app folder can move on its own', async () => {
    await setUpWithDataBesideApp(install.homeDir, SAVED_PORT);
    await writeAbsoluteReference(install.homeDir, install.referenceDir);
    // Only the app folder moves, one level deeper; the Reference folder stays where it was.
    const movedHome = path.join(install.rootDir, 'Apps', 'Morgue File tést');
    await mkdir(path.dirname(movedHome));
    await rename(install.homeDir, movedHome);

    expect(await loadInstallState(movedHome)).toEqual({
      kind: 'ready',
      dataDir: path.join(movedHome, 'data'),
      referenceDir: install.referenceDir,
    });
  });

  it('R29: when the whole drive moves (a new drive letter), the relative path finds it', async () => {
    await setUpWithDataBesideApp(install.homeDir, SAVED_PORT);
    await writeAbsoluteReference(install.homeDir, install.referenceDir);
    const movedRoot = `${install.rootDir}-moved`;
    await rename(install.rootDir, movedRoot);
    try {
      const movedHome = path.join(movedRoot, 'Morgue File tést');
      expect(await loadInstallState(movedHome)).toMatchObject({
        kind: 'ready',
        referenceDir: path.join(movedRoot, 'Reference tést'),
      });
    } finally {
      await rename(movedRoot, install.rootDir);
    }
  });
});
