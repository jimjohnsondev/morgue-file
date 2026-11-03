// Prepares the set-up install the Playwright server runs from: a data folder whose library has
// already indexed the fixture archive and applied fixtures/seed.json, so pages show the design
// brief's sample content from the first request. Run with plain node after `npm run build` and
// `npm run fixtures`, before the server starts (see playwright.config.ts).
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { openLibrary } from '#core/db/library.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { scanRoot } from '#core/indexer/scanner.js';

import { applySeed } from '../../scripts/fixtures/apply-seed.ts';
import { loadSeed } from '../../scripts/fixtures/seed.ts';

const REPO_DIR = path.resolve(import.meta.dirname, '..', '..');
const REFERENCE_DIR = path.join(REPO_DIR, 'fixtures', 'generated', 'Reference');

/** The time the seed stamps on what it adds, so the footer reads "site last updated 31 Oct 2026". */
const SEED_TIME = '2026-10-31T12:00:00.000Z';

const homeDir = process.env.MORGUE_HOME;
if (homeDir === undefined || homeDir === '') {
  throw new Error('Set MORGUE_HOME to the folder to prepare.');
}
if (!existsSync(REFERENCE_DIR)) {
  throw new Error(`No fixture archive at ${REFERENCE_DIR}. Run npm run fixtures first.`);
}

const dataDir = path.join(homeDir, 'data');
rmSync(homeDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });
writeFileSync(path.join(homeDir, 'morgue-file.json'), JSON.stringify({ dataDir: 'data' }));
writeFileSync(
  path.join(dataDir, 'settings.json'),
  JSON.stringify({ referenceDirAbsolute: REFERENCE_DIR }),
);

const db = openLibrary({ dataDir, appVersion: 'e2e', referenceDir: REFERENCE_DIR });
try {
  await scanRoot({ db, rootId: REFERENCE_ROOT_ID, rootPath: REFERENCE_DIR });
  const seed = await loadSeed(path.join(REPO_DIR, 'fixtures', 'seed.json'));
  applySeed(db, seed, { rootId: REFERENCE_ROOT_ID, now: SEED_TIME });
} finally {
  db.close();
}
