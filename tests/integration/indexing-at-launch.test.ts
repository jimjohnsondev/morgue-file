import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { LIBRARY_FILE_NAME, openDatabase } from '#core/db/connection.js';
import { buildApp } from '#server/app.js';
import { loadInstallState } from '#server/install/install-state.js';
import { createLibraryRuntime } from '#server/library-runtime.js';
import { runServer } from '#server/run.js';

import { writeSampleArchive } from '../support/sample-archive.ts';
import { makeTempInstall } from '../support/temp-install.js';

import type { SampleArchive } from '../support/sample-archive.ts';
import type { TempInstall } from '../support/temp-install.js';

const PORT = 47695;
const TOKEN = 'test-token';
const ITEMS_IN_SAMPLE = 11;

let archive: SampleArchive;
let install: TempInstall;
const cleanups: (() => Promise<void>)[] = [];

beforeAll(async () => {
  archive = await writeSampleArchive();
}, 120_000);

afterAll(async () => {
  await rm(archive.referenceDir, { recursive: true, force: true });
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

/** Counts the items in a data folder's library, and how many have their thumbnail. */
function countItems(dataDir: string): { items: number; thumbnails: number } {
  const db = openDatabase(path.join(dataDir, LIBRARY_FILE_NAME));
  try {
    return db
      .prepare(
        `SELECT count(*) AS items, count(*) FILTER (WHERE thumb_state = 'ready') AS thumbnails
         FROM items`,
      )
      .get() as { items: number; thumbnails: number };
  } finally {
    db.close();
  }
}

describe('indexing in the background', () => {
  it('R6: a set-up app indexes the Reference folder and makes thumbnails once it is listening', async () => {
    install = await makeTempInstall();
    cleanups.push(install.remove);
    const dataDir = path.join(install.homeDir, 'data');
    await mkdir(dataDir);
    await writeFile(
      path.join(install.homeDir, 'morgue-file.json'),
      JSON.stringify({ dataDir: 'data' }),
    );
    await writeFile(
      path.join(dataDir, 'settings.json'),
      JSON.stringify({ referenceDirAbsolute: archive.referenceDir }),
    );
    const server = await runServer({
      config: install.config,
      install: { current: await loadInstallState(install.homeDir) },
      ports: [PORT],
      logger: false,
    });
    cleanups.push(server.stop);
    const health = await fetch(`http://127.0.0.1:${String(PORT)}/healthz`);
    expect(health.status).toBe(200);

    await server.library.whenIndexed();
    expect(countItems(dataDir)).toEqual({ items: ITEMS_IN_SAMPLE, thumbnails: ITEMS_IN_SAMPLE });
  }, 120_000);

  it('R30: finishing setup starts indexing without a restart', async () => {
    install = await makeTempInstall();
    cleanups.push(install.remove);
    const library = createLibraryRuntime({ appDir: install.config.appDir, appVersion: 'test' });
    const app = await buildApp({
      config: { ...install.config, port: PORT },
      install: { current: { kind: 'needs-setup' } },
      token: TOKEN,
      library,
    });
    cleanups.push(async () => {
      await library.stop();
      await app.close();
    });
    const save = await app.inject({
      method: 'POST',
      url: '/api/setup/save',
      headers: {
        host: `127.0.0.1:${String(PORT)}`,
        origin: `http://127.0.0.1:${String(PORT)}`,
        'x-morgue-token': TOKEN,
      },
      payload: { referenceDir: archive.referenceDir, dataChoice: 'with-app' },
    });
    expect(save.statusCode).toBe(200);

    await library.whenIndexed();
    // Setup adds an empty Inbox folder, which holds no items.
    expect(countItems(path.join(install.homeDir, 'data'))).toEqual({
      items: ITEMS_IN_SAMPLE,
      thumbnails: ITEMS_IN_SAMPLE,
    });
  }, 120_000);
});
