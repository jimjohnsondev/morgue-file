// Starts a server on a small copy of the fixture archive, held in one of the edge states the
// shared e2e server can't reach (E1, E3-E5), for the design gate's screenshot specs. Run with
// plain node after `npm run build` and `npm run fixtures`:
//   MORGUE_STATE=offline MORGUE_PORT=47695 node tests/support/start-state-server.ts
// It listens only once every thumbnail is made and the state is in place, so a spec that waits
// for /healthz finds the page ready to capture.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { openLibrary } from '#core/db/library.js';
import { refileItemsByMappings } from '#core/db/repositories/items.js';
import { REFERENCE_ROOT_ID, setReferenceRoot, setRootStatus } from '#core/db/repositories/roots.js';
import {
  findSubcategoryBySlug,
  insertFolderMapping,
  insertSubcategory,
} from '#core/db/repositories/subcategories.js';
import { scanRoot } from '#core/indexer/scanner.js';
import { slugify } from '#core/slug.js';
import { buildApp } from '#server/app.js';
import { findAppDir, LOOPBACK_HOST } from '#server/config.js';
import { loadInstallState } from '#server/install/install-state.js';
import { createLibraryRuntime } from '#server/library-runtime.js';

import type { Db } from '#core/db/connection.js';
import type { Section } from '#core/db/repositories/items.js';
import type { LibraryRuntime } from '#server/library-runtime.js';

/**
 * The states a spec can ask for. Unsorted is empty in all of them (E1). `watching`, `ingest` and
 * `settings` are `empty-unsorted` in homes of their own, for the R1, R2 and R36 specs, which add
 * files to them or change their subcategories.
 */
const STATES = ['empty-unsorted', 'offline', 'indexing', 'watching', 'ingest', 'settings'] as const;
type State = (typeof STATES)[number];

const REPO_DIR = path.resolve(import.meta.dirname, '..', '..');
const FIXTURE_DIR = path.join(REPO_DIR, 'fixtures', 'generated', 'Reference');

/** Where the offline drive is said to be, as on the design brief's E3 and E4. */
const OFFLINE_FOLDER = 'E:\\Reference';

/** The counters E5 is drawn with: a first index part-way through a large archive. */
const HELD_PROGRESS = { found: 12_400, expected: 48_000, isPaused: false } as const;

/** How many entries of each fixture folder the small copy takes, and where they are filed. */
const COPIED_FOLDERS = [
  { folder: 'Figure', count: 24, section: 'photos' },
  { folder: 'Books', count: 3, section: 'library' },
] as const satisfies readonly { folder: string; count: number; section: Section }[];

/** Reads the state from MORGUE_STATE, refusing anything else. */
function readState(): State {
  const state = STATES.find((known) => known === process.env.MORGUE_STATE);
  if (state === undefined) {
    throw new Error(`Set MORGUE_STATE to one of: ${STATES.join(', ')}.`);
  }
  return state;
}

/** Reads the port from MORGUE_PORT. */
function readPort(): number {
  const port = Number(process.env.MORGUE_PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('Set MORGUE_PORT to the port to listen on.');
  }
  return port;
}

/**
 * Copies the first entries of each folder, keeping their times, so the footer's "site last
 * updated" day comes from the fixture rather than from today.
 */
function copyFixtureSubset(referenceDir: string): void {
  for (const { folder, count } of COPIED_FOLDERS) {
    const names = readdirSync(path.join(FIXTURE_DIR, folder)).sort().slice(0, count);
    for (const name of names) {
      cpSync(path.join(FIXTURE_DIR, folder, name), path.join(referenceDir, folder, name), {
        recursive: true,
        preserveTimestamps: true,
      });
    }
  }
}

/** Indexes the copy and files each folder under a subcategory of its own name. */
async function indexSubset(db: Db, referenceDir: string): Promise<void> {
  await scanRoot({ db, rootId: REFERENCE_ROOT_ID, rootPath: referenceDir });
  for (const { folder, section } of COPIED_FOLDERS) {
    // Library starts with a Books subcategory (migration 001); Photos starts with none.
    const subcategoryId =
      findSubcategoryBySlug(db, section, slugify(folder))?.id ??
      insertSubcategory(db, section, folder);
    insertFolderMapping(db, { rootId: REFERENCE_ROOT_ID, relPrefix: folder, subcategoryId });
  }
  refileItemsByMappings(db, REFERENCE_ROOT_ID);
}

/** Makes a set-up home whose library already holds the indexed copy. Returns the home folder. */
async function prepareHome(state: State): Promise<string> {
  if (!existsSync(FIXTURE_DIR)) {
    throw new Error(`No fixture archive at ${FIXTURE_DIR}. Run npm run fixtures first.`);
  }
  const homeDir = path.join(os.tmpdir(), `morgue-file-state-${state}`);
  const dataDir = path.join(homeDir, 'data');
  const referenceDir = path.join(homeDir, 'Reference');
  rmSync(homeDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
  copyFixtureSubset(referenceDir);
  writeFileSync(path.join(homeDir, 'morgue-file.json'), JSON.stringify({ dataDir: 'data' }));
  writeFileSync(
    path.join(dataDir, 'settings.json'),
    JSON.stringify({ referenceDirAbsolute: referenceDir }),
  );
  const db = openLibrary({ dataDir, appVersion: 'state', referenceDir });
  try {
    await indexSubset(db, referenceDir);
  } finally {
    db.close();
  }
  return homeDir;
}

/** The runtime pages see: the real one, except that E5 reports a scan held part-way. */
function libraryForState(runtime: LibraryRuntime, state: State): LibraryRuntime {
  return state === 'indexing' ? { ...runtime, indexing: () => HELD_PROGRESS } : runtime;
}

/** Marks the Reference folder offline at the brief's drive letter, once its thumbnails exist. */
function takeOffline(runtime: LibraryRuntime): void {
  const db = runtime.open()?.db;
  if (db === undefined) {
    throw new Error('The library did not open.');
  }
  setReferenceRoot(db, OFFLINE_FOLDER);
  setRootStatus(db, REFERENCE_ROOT_ID, 'offline');
}

/** Prepares the home, makes every thumbnail, puts the library in its state, then listens. */
async function startStateServer(): Promise<void> {
  const state = readState();
  const port = readPort();
  const homeDir = await prepareHome(state);
  const install = { current: await loadInstallState(homeDir) };
  if (install.current.kind !== 'ready') {
    throw new Error(`The home at ${homeDir} is not set up.`);
  }
  const appDir = findAppDir();
  const runtime = createLibraryRuntime({ appDir, appVersion: 'state' });
  const app = await buildApp({
    config: { host: LOOPBACK_HOST, port, appDir, homeDir, version: 'state' },
    install,
    library: libraryForState(runtime, state),
  });
  runtime.start(install.current, app.log);
  await runtime.whenIndexed();
  if (state === 'offline') {
    takeOffline(runtime);
  }
  await app.listen({ host: LOOPBACK_HOST, port });
}

await startStateServer();
