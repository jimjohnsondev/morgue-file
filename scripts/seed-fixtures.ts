// Seeds an indexed fixture library with fixtures/seed.json (docs/ARCHITECTURE.md, Fixture
// archive). Imports the built app, so it runs after `npm run build:server`. Usage:
//   node scripts/seed-fixtures.ts <library.db>
import path from 'node:path';

import { openDatabase } from '#core/db/connection.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';

import { applySeed } from './fixtures/apply-seed.ts';
import { loadSeed } from './fixtures/seed.ts';

const REPO_DIR = path.resolve(import.meta.dirname, '..');

const databasePath = process.argv[2];
if (databasePath === undefined) {
  console.error('Usage: node scripts/seed-fixtures.ts <library.db>');
  process.exit(1);
}
const db = openDatabase(path.resolve(databasePath));
try {
  const seed = await loadSeed(path.join(REPO_DIR, 'fixtures', 'seed.json'));
  applySeed(db, seed, { rootId: REFERENCE_ROOT_ID, now: '2026-10-31T12:00:00.000Z' });
  console.info(`Seeded ${databasePath}.`);
} finally {
  db.close();
}
