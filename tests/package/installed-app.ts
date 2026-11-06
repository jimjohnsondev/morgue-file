// Helpers for the package test: unzip the release, start and stop Morgue File.cmd as a user would.
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import type { ChildProcess } from 'node:child_process';

/** The default port, which a fresh install uses. */
export const APP_URL = 'http://127.0.0.1:47613';

/** Where CI installs, from docs/ARCHITECTURE.md: a path with a space and an accent. */
export const TEMP_DIR = 'C:\\Temp';

/** Returns the zip build.yml made, from MORGUE_PACKAGE_ZIP. */
export function findReleaseZip(): string {
  const zip = process.env.MORGUE_PACKAGE_ZIP;
  if (zip === undefined || zip === '') {
    throw new Error('Set MORGUE_PACKAGE_ZIP to the release zip to test.');
  }
  return zip;
}

/** README Install step 4: extracts the zip into a fresh folder and returns MorgueFile\ in it. */
export async function extractRelease(zip: string, parentDir: string): Promise<string> {
  await rm(parentDir, { recursive: true, force: true });
  await mkdir(parentDir, { recursive: true });
  // Expand-Archive is what Extract All does; paths go through the environment, never quoting.
  execFileSync(
    'powershell',
    ['-NoProfile', '-Command', 'Expand-Archive -LiteralPath $env:ZIP -DestinationPath $env:DEST'],
    { env: { ...process.env, ZIP: zip, DEST: parentDir } },
  );
  return path.join(parentDir, 'MorgueFile');
}

/** Makes a Reference folder holding one placeholder file. PR 4 swaps in the fixture archive. */
export async function makeReferenceFolder(folder: string): Promise<void> {
  await rm(folder, { recursive: true, force: true });
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'placeholder.txt'), 'Not a real reference file.');
}

/** Waits until something answers the health check, or fails after about 30 s. */
export async function waitForApp(): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      if ((await fetch(`${APP_URL}/healthz`)).ok) {
        return;
      }
    } catch {
      // Not listening yet; try again shortly.
    }
    await sleep(250);
  }
  throw new Error(`Morgue File didn't answer at ${APP_URL}.`);
}

/** Every copy startMorgueFile() started that is still running. */
const started = new Set<ChildProcess>();

/**
 * README First run step 1: double-clicks Morgue File.cmd. It starts from another working
 * directory, as a shortcut can, and with the browser left closed (the test drives its own).
 */
export function startMorgueFile(installDir: string): ChildProcess {
  const launcher = path.join(installDir, 'Morgue File.cmd');
  const child = spawn('cmd.exe', ['/d', '/s', '/c', `""${launcher}""`], {
    cwd: os.tmpdir(),
    env: { ...process.env, MORGUE_NO_BROWSER: '1' },
    windowsVerbatimArguments: true,
    stdio: 'inherit',
  });
  started.add(child);
  child.once('exit', () => {
    started.delete(child);
  });
  return child;
}

/** Waits for a process to end and returns its exit code. */
export async function waitForExit(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null) {
    return child.exitCode;
  }
  return new Promise((resolve) =>
    child.once('exit', (code) => {
      resolve(code);
    }),
  );
}

/** Waits until the server has stopped listening, so the next start can't reach the old one. */
async function waitForAppToStop(): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      await fetch(`${APP_URL}/healthz`, { signal: AbortSignal.timeout(1000) });
    } catch {
      return;
    }
    await sleep(250);
  }
  throw new Error(`Morgue File still answers at ${APP_URL} after being stopped.`);
}

/** Closes the "Morgue File server" window: ends cmd.exe and the node.exe it started. */
export async function stopMorgueFile(child: ChildProcess): Promise<void> {
  if (child.pid !== undefined && child.exitCode === null) {
    execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f']);
  }
  await waitForExit(child);
  await waitForAppToStop();
}

/** Stops every copy a test started and didn't stop, as when the test failed part way. */
export async function stopEveryStartedCopy(): Promise<void> {
  for (const child of [...started]) {
    await stopMorgueFile(child);
  }
}

/** The errors Windows gives for a folder something still holds open. */
const FOLDER_BUSY_CODES: ReadonlySet<string> = new Set(['EPERM', 'EBUSY', 'EACCES']);

/** Says whether a failed rename was refused because the folder is still held open. */
function isFolderBusy(error: unknown): boolean {
  return error instanceof Error && 'code' in error && FOLDER_BUSY_CODES.has(String(error.code));
}

/**
 * README "Move or back up": moves the closed app's folder. Windows can hold a folder open for a
 * moment after its process ends (handles closing, antivirus scanning the new files), so a refused
 * rename is retried for up to 15 s, as a person would simply try again. Retries are logged, so
 * CI shows if the hold ever grows.
 */
export async function moveFolder(from: string, to: string): Promise<void> {
  const maxAttempts = 30;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await rename(from, to);
      if (attempt > 1) {
        console.warn(`Moving ${from} succeeded on attempt ${String(attempt)}.`);
      }
      return;
    } catch (error) {
      if (!isFolderBusy(error) || attempt === maxAttempts) {
        throw error;
      }
      await sleep(500);
    }
  }
}
