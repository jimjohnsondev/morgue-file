// Temporary home and Reference folders for setup and launcher tests. Removed after each test.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { findAppDir, LOOPBACK_HOST } from '#server/config.js';

import type { ServerConfig } from '#server/config.js';

/** A home folder beside a Reference folder with a few placeholder files, like a USB drive. */
export type TempInstall = {
  readonly rootDir: string;
  readonly homeDir: string;
  readonly referenceDir: string;
  readonly config: Omit<ServerConfig, 'port'>;
  readonly remove: () => Promise<void>;
};

/** Creates the folders. The Reference folder's name has a space and an accent, as on CI. */
export async function makeTempInstall(): Promise<TempInstall> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-test-'));
  const homeDir = path.join(rootDir, 'Morgue File tést');
  const referenceDir = path.join(rootDir, 'Reference tést');
  await mkdir(homeDir, { recursive: true });
  await mkdir(path.join(referenceDir, 'Figure'), { recursive: true });
  await writeFile(path.join(referenceDir, 'placeholder-one.txt'), 'Not a real reference file.');
  await writeFile(path.join(referenceDir, 'placeholder-two.txt'), 'Not a real reference file.');
  return {
    rootDir,
    homeDir,
    referenceDir,
    config: { host: LOOPBACK_HOST, appDir: findAppDir(), homeDir, version: '0.0.0-test' },
    remove: () => rm(rootDir, { recursive: true, force: true }),
  };
}
