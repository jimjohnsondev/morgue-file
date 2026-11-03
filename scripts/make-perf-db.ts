// Makes the synthetic 50,000-item library the performance tests run against (docs/ARCHITECTURE.md,
// Testing). Imports the built app, so `npm run fixtures:perf` builds the server first. Usage:
//   node scripts/make-perf-db.ts [output file, default fixtures/generated/perf.db]
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import { openDatabase } from '#core/db/connection.js';
import { migrate } from '#core/db/migrations.js';
import { REFERENCE_ROOT_ID, setReferenceRoot } from '#core/db/repositories/roots.js';

import { loadPerfItems } from './fixtures/load-perf-items.ts';
import { planPerfItems } from './fixtures/perf-plan.ts';

const REPO_DIR = path.resolve(import.meta.dirname, '..');

/** Writes a fresh perf library, replacing any earlier one. */
function makePerfDb(outputPath: string): void {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(outputPath + suffix, { force: true });
  }
  const db = openDatabase(outputPath);
  try {
    migrate(db, { backupsDir: path.dirname(outputPath), appVersion: 'perf', now: new Date() });
    // The perf library has rows but no files, so its root points nowhere real.
    setReferenceRoot(db, path.join(path.dirname(outputPath), 'perf-reference'));
    const items = planPerfItems();
    loadPerfItems(db, REFERENCE_ROOT_ID, items);
    console.info(`${String(items.length)} perf items written to ${outputPath}.`);
  } finally {
    db.close();
  }
}

makePerfDb(
  path.resolve(process.argv[2] ?? path.join(REPO_DIR, 'fixtures', 'generated', 'perf.db')),
);
