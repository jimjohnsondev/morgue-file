// R18 on the synthetic 50,000-item library (npm run fixtures:perf): every Index page renders in
// under 300 ms, deep pages and filtered lists included. Starts its own server on a copy of
// tests/perf/perf.db, so the timings are the server's, not the shared e2e server's.
import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import type { ChildProcess } from 'node:child_process';

const PORT = 47693;
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;
const PERF_DB = path.resolve(import.meta.dirname, 'perf.db');

/** The budget for one Index page render (R18). */
const PAGE_BUDGET_MS = 300;
const RUNS_PER_PAGE = 20;

/** Index pages of every kind, from the first page to the deepest. */
const PAGES = [
  '/photos',
  '/photos?page=480',
  '/photos/figure',
  '/photos/figure?page=120&per=96',
  '/photos/portrait?per=192&size=large',
  '/video/poses',
  '/library/books',
  '/unsorted',
  '/tags/tag-007',
  '/search?q=tag%3Atag-010+rating%3A3%2B',
  '/search?q=model%3A%22Model+12%22',
  '/search?q=in%3Aphotos+-tag%3Atag-001+perf_4',
];

let server: ChildProcess | undefined;
let homeDir = '';

/** Waits until the server answers its health check. */
async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      if ((await fetch(`${BASE_URL}/healthz`)).ok) {
        return;
      }
    } catch {
      // Not listening yet; try again shortly.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('The perf server did not start.');
}

test.beforeAll(async () => {
  homeDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-perf-'));
  const dataDir = path.join(homeDir, 'data');
  await mkdir(dataDir);
  await copyFile(PERF_DB, path.join(dataDir, 'library.db'));
  await writeFile(path.join(homeDir, 'morgue-file.json'), JSON.stringify({ dataDir: 'data' }));
  await writeFile(path.join(dataDir, 'settings.json'), '{}');
  server = spawn(process.execPath, ['dist/server/main.js'], {
    env: { ...process.env, MORGUE_HOME: homeDir, MORGUE_PORT: String(PORT) },
    stdio: 'ignore',
  });
  await waitForServer();
});

test.afterAll(async () => {
  server?.kill();
  await new Promise((resolve) => setTimeout(resolve, 500));
  await rm(homeDir, { recursive: true, force: true });
});

/** The 95th-percentile time of a list of times. */
function p95(times: readonly number[]): number {
  const sorted = [...times].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
}

test('R18: any Index page of a 50,000-item archive renders in under 300 ms', async () => {
  const slowest: Record<string, number> = {};
  for (const url of PAGES) {
    const warmUp = await fetch(BASE_URL + url);
    expect(warmUp.status, url).toBe(200);
    const times: number[] = [];
    for (let run = 0; run < RUNS_PER_PAGE; run++) {
      const started = performance.now();
      await (await fetch(BASE_URL + url)).text();
      times.push(performance.now() - started);
    }
    slowest[url] = Math.round(p95(times));
  }
  test.info().annotations.push({ type: 'p95 ms per page', description: JSON.stringify(slowest) });
  for (const [url, time] of Object.entries(slowest)) {
    expect(time, `${url} (p95 of every page: ${JSON.stringify(slowest)})`).toBeLessThan(
      PAGE_BUDGET_MS,
    );
  }
});
