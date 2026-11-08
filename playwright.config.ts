// End-to-end, visual and performance tests: the real built server, driven in Chromium.
import os from 'node:os';
import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

/** The port tests run the server on, kept off the default so a running copy doesn't clash. */
const TEST_PORT = 47690;

/** The set-up install the server runs from, outside the repo so tests never touch real data. */
const TEST_HOME = path.join(os.tmpdir(), 'morgue-file-e2e-home');

export default defineConfig({
  testDir: 'tests',
  testMatch: ['e2e/**/*.spec.ts', 'visual/**/*.spec.ts', 'perf/**/*.spec.ts'],
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: process.env.CI === undefined ? 'list' : [['list'], ['github']],
  use: {
    baseURL: `http://127.0.0.1:${String(TEST_PORT)}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'e2e',
      testMatch: 'e2e/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'visual',
      testMatch: 'visual/**/*.spec.ts',
      // One folder for every baseline, with no platform suffix: only the Windows runner makes them.
      snapshotPathTemplate: '{testDir}/visual/__screenshots__/{testFileName}/{arg}{ext}',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 2560, height: 1440 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'perf',
      testMatch: 'perf/**/*.spec.ts',
      // One spec at a time: timed specs that share the runner's cores slow each other down.
      workers: 1,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node tests/support/make-e2e-home.ts && node dist/server/main.js',
    url: `http://127.0.0.1:${String(TEST_PORT)}/healthz`,
    env: { MORGUE_PORT: String(TEST_PORT), MORGUE_HOME: TEST_HOME },
    reuseExistingServer: false,
    // The home is made by indexing and seeding the fixture archive first, which takes a while.
    timeout: 180_000,
  },
});
