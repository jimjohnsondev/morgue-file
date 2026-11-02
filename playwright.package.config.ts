// The package test: installs the release zip as the README says and runs it (R29, R30, R31).
// Windows only. build.yml runs it after scripts/package-win.ts, with MORGUE_PACKAGE_ZIP set.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/package',
  testMatch: '**/*.spec.ts',
  // The tests share port 47613 and C:\Temp, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 180_000,
  reporter: process.env.CI === undefined ? 'list' : [['list'], ['github']],
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
});
