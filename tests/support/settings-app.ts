// A set-up app on a small temp Reference folder with the real library runtime, for the Settings
// tests: it indexes and watches its folders as the app does, and takes writes with the token.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildApp } from '#server/app.js';
import { findAppDir, LOOPBACK_HOST } from '#server/config.js';
import { loadInstallState } from '#server/install/install-state.js';
import { createLibraryRuntime } from '#server/library-runtime.js';

import type { Db } from '#core/db/connection.js';
import type { InstallStateHolder } from '#server/install/install-state.js';
import type { LibraryRuntime } from '#server/library-runtime.js';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

const PORT = 47697;
const TOKEN = 'settings-test-token';

/** A running app and the folders around it. */
export type SettingsApp = {
  readonly app: FastifyInstance;
  readonly library: LibraryRuntime;
  readonly install: InstallStateHolder;
  readonly db: Db;
  /** The folder holding the home, the Reference folder and any other folder a test makes. */
  readonly rootDir: string;
  readonly homeDir: string;
  readonly dataDir: string;
  readonly referenceDir: string;
  /** Writes a placeholder file under a folder; its bytes depend on its path, so none match. */
  readonly writeFileUnder: (folder: string, relPath: string) => Promise<void>;
  /** Asks for a page the way the browser does. */
  readonly get: (url: string) => Promise<LightMyRequestResponse>;
  /** Sends a write the way the page does: same origin, with the token. */
  readonly send: (
    method: 'POST' | 'DELETE',
    url: string,
    payload?: Record<string, string>,
  ) => Promise<LightMyRequestResponse>;
  readonly remove: () => Promise<void>;
};

/** Writes a small file whose bytes depend on its path. Placeholder images fail their thumbnails. */
async function writePlaceholder(folder: string, relPath: string): Promise<void> {
  const file = path.join(folder, ...relPath.split('/'));
  await mkdir(path.dirname(file), { recursive: true });
  const bytes = Buffer.alloc(2048);
  bytes.write(relPath);
  await writeFile(file, bytes);
}

/** Writes the home and its data folder's settings.json, pointing at the Reference folder. */
async function writeHome(homeDir: string, referenceDir: string): Promise<string> {
  const dataDir = path.join(homeDir, 'data');
  await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(homeDir, 'morgue-file.json'), JSON.stringify({ dataDir: 'data' }));
  await writeFile(
    path.join(dataDir, 'settings.json'),
    JSON.stringify({ referenceDirAbsolute: referenceDir }),
  );
  return dataDir;
}

/**
 * Makes a Reference folder holding these files, sets up a home beside it, starts the app and
 * waits for the first index. Folder names have a space and an accent, as on CI.
 */
export async function startSettingsApp(files: readonly string[]): Promise<SettingsApp> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-settings-'));
  const homeDir = path.join(rootDir, 'Morgue File tést');
  const referenceDir = path.join(rootDir, 'Reference tést');
  for (const file of files) {
    await writePlaceholder(referenceDir, file);
  }
  await mkdir(path.join(referenceDir, 'Inbox'), { recursive: true });
  const dataDir = await writeHome(homeDir, referenceDir);
  const install = { current: await loadInstallState(homeDir) };
  const appDir = findAppDir();
  const library = createLibraryRuntime({
    appDir,
    appVersion: 'test',
    recheckMs: 200,
    settleMs: 100,
  });
  const app = await buildApp({
    config: { host: LOOPBACK_HOST, port: PORT, appDir, homeDir, version: '0.0.0-test' },
    install,
    token: TOKEN,
    library,
  });
  if (install.current.kind !== 'ready') {
    throw new Error('The test home is not set up.');
  }
  library.start(install.current, app.log);
  await library.whenIndexed();
  const db = library.open()?.db;
  if (db === undefined) {
    throw new Error('The library did not open.');
  }
  return {
    app,
    library,
    install,
    db,
    rootDir,
    homeDir,
    dataDir,
    referenceDir,
    writeFileUnder: writePlaceholder,
    get: async (url) => app.inject({ url, headers: { host: `127.0.0.1:${String(PORT)}` } }),
    send: async (method, url, payload) =>
      app.inject({
        method,
        url,
        headers: {
          host: `127.0.0.1:${String(PORT)}`,
          origin: `http://127.0.0.1:${String(PORT)}`,
          'x-morgue-token': TOKEN,
        },
        ...(payload && { payload }),
      }),
    remove: async () => {
      await library.stop();
      await app.close();
      await rm(rootDir, { recursive: true, force: true });
    },
  };
}

/** Polls until a check passes; fails after `limitMs` (R1 allows 5 s for a change to show). */
export async function waitFor(check: () => boolean, limitMs = 5000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > limitMs) {
      throw new Error(`Still waiting after ${String(limitMs)} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
