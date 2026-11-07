// R24 on the synthetic 50,000-item library (npm run fixtures:perf): each of 20 representative
// searches returns its results in under 200 ms at the 95th percentile. A result is what the
// search page reads: the counts per section, the first page of 96 items, and the models its
// words find. Runs the built core on a copy of tests/perf/perf.db.
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { openDatabase } from '#core/db/connection.js';
import { countItemsBySectionByQuery, findItemsByQuery } from '#core/db/repositories/item-lists.js';
import { findModelsByText } from '#core/db/repositories/search-rows.js';
import { compileQuery } from '#core/query/compile-query.js';
import { parseQuery } from '#core/query/parse-query.js';
import { textMatch } from '#core/query/text-match.js';

import { REPRESENTATIVE_SEARCHES } from '../support/search-queries.js';

import type { Db } from '#core/db/connection.js';

const PERF_DB = path.resolve(import.meta.dirname, 'perf.db');

/** The budget for one search's results (R24). */
const SEARCH_BUDGET_MS = 200;
const RUNS_PER_SEARCH = 20;

let db: Db | undefined;
let copyDir = '';

test.beforeAll(async () => {
  copyDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-perf-search-'));
  const copy = path.join(copyDir, 'library.db');
  await copyFile(PERF_DB, copy);
  db = openDatabase(copy);
});

test.afterAll(async () => {
  db?.close();
  await rm(copyDir, { recursive: true, force: true });
});

/** Everything the search page reads for a query string; returns how many items it matched. */
function runSearch(library: Db, text: string): number {
  const query = parseQuery(text);
  const compiled = compileQuery(query);
  const bySection = countItemsBySectionByQuery(library, compiled);
  findItemsByQuery(library, compiled, { limit: 96, offset: 0 });
  const { match, excluded } = textMatch(query);
  if (match !== undefined) {
    findModelsByText(library, { match, excluded, limit: 12 });
  }
  let total = 0;
  for (const count of bySection.values()) {
    total += count;
  }
  return total;
}

/** The 95th-percentile time of a list of times. */
function p95(times: readonly number[]): number {
  const sorted = [...times].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
}

test('R24: search results return in under 200 ms at 50,000 items', () => {
  const library = db!;
  const slowest: Record<string, number> = {};
  const matched: Record<string, number> = {};
  for (const text of REPRESENTATIVE_SEARCHES) {
    matched[text] = runSearch(library, text);
    const times: number[] = [];
    for (let run = 0; run < RUNS_PER_SEARCH; run++) {
      const started = performance.now();
      runSearch(library, text);
      times.push(performance.now() - started);
    }
    slowest[text] = Math.round(p95(times));
  }
  test
    .info()
    .annotations.push(
      { type: 'p95 ms per search', description: JSON.stringify(slowest) },
      { type: 'items matched', description: JSON.stringify(matched) },
    );
  // A search that matches nothing times nothing; each of these should find items.
  for (const [text, count] of Object.entries(matched)) {
    expect(count, `"${text}" matched no items`).toBeGreaterThan(0);
  }
  for (const [text, time] of Object.entries(slowest)) {
    expect(time, `"${text}" (p95 of every search: ${JSON.stringify(slowest)})`).toBeLessThan(
      SEARCH_BUDGET_MS,
    );
  }
});
