// Makes the synthetic 50,000-item library for the performance tests (docs/ARCHITECTURE.md,
// Testing). Until the schema lands (build plan PR 5) it writes the rows as JSON lines; PR 5 loads
// them into tests/perf/perf.db through the repositories. Usage:
//   node scripts/make-perf-db.ts [output file, default fixtures/generated/perf-items.jsonl]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { planPerfItems } from './fixtures/perf-plan.ts';

const REPO_DIR = path.resolve(import.meta.dirname, '..');

/** Writes one JSON object per line, so the file streams in row by row. */
async function makePerfRows(outputPath: string): Promise<void> {
  const items = planPerfItems();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, items.map((item) => JSON.stringify(item)).join('\n') + '\n');
  console.info(`${String(items.length)} perf items written to ${outputPath}.`);
}

await makePerfRows(
  path.resolve(process.argv[2] ?? path.join(REPO_DIR, 'fixtures', 'generated', 'perf-items.jsonl')),
);
