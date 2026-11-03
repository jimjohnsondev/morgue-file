// Builds the portable Windows zip, MorgueFile-<version>-win-x64.zip, with its own Node runtime
// (docs/ARCHITECTURE.md, Packaging). Run on Windows after `npm run build`:
//   node scripts/package-win.ts
// The zip and its .sha256 land in release/. The package test (tests/package/) then installs it.
import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { marked } from 'marked';

const REPO_DIR = path.resolve(import.meta.dirname, '..');
const RELEASE_DIR = path.join(REPO_DIR, 'release');
const STAGE_DIR = path.join(RELEASE_DIR, 'MorgueFile');
const NODE_DIST_URL = 'https://nodejs.org/dist';

/**
 * Windows' own tar.exe (bsdtar), which reads and writes zip files. Named in full because Git
 * Bash puts GNU tar, which can't, first on the PATH of CI's bash steps.
 */
const WINDOWS_TAR = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');

/** Reads the version release-please set in package.json. */
function readAppVersion(): string {
  const packageJson = JSON.parse(readFileSync(path.join(REPO_DIR, 'package.json'), 'utf8')) as {
    version: string;
  };
  return packageJson.version;
}

/** Downloads a file into memory, failing on any HTTP error. */
async function download(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${String(response.status)}): ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Downloads the Node runtime this script runs on, which CI took from .nvmrc, so the native
 * modules installed below match it. The zip is checked against Node's published SHA-256 list.
 */
async function addNodeRuntime(): Promise<void> {
  const zipName = `node-${process.version}-win-x64.zip`;
  const checksums = (
    await download(`${NODE_DIST_URL}/${process.version}/SHASUMS256.txt`)
  ).toString();
  const expected = checksums
    .split('\n')
    .find((line) => line.endsWith(`  ${zipName}`))
    ?.split(' ')[0];
  const zip = await download(`${NODE_DIST_URL}/${process.version}/${zipName}`);
  const actual = createHash('sha256').update(zip).digest('hex');
  if (expected === undefined || expected !== actual) {
    throw new Error(`${zipName} doesn't match SHASUMS256.txt; refusing to package it.`);
  }
  const unpackDir = path.join(RELEASE_DIR, 'node-download');
  mkdirSync(unpackDir, { recursive: true });
  writeFileSync(path.join(unpackDir, zipName), zip);
  execFileSync(WINDOWS_TAR, ['-xf', zipName], { cwd: unpackDir });
  const unpacked = path.join(unpackDir, zipName.replace(/\.zip$/, ''));
  cpSync(path.join(unpacked, 'node.exe'), path.join(STAGE_DIR, 'node', 'node.exe'));
  cpSync(path.join(unpacked, 'LICENSE'), path.join(STAGE_DIR, 'LICENSES', 'node.txt'));
  rmSync(unpackDir, { recursive: true, force: true });
}

/** Copies the built app and installs its runtime dependencies only, leaving the repo untouched. */
function addApp(): void {
  const appDir = path.join(STAGE_DIR, 'app');
  cpSync(path.join(REPO_DIR, 'dist'), path.join(appDir, 'dist'), { recursive: true });
  for (const file of ['package.json', 'package-lock.json']) {
    cpSync(path.join(REPO_DIR, file), path.join(appDir, file));
  }
  // A fixed command with no user input; the shell is only there to find npm.cmd on Windows.
  execSync('npm ci --omit=dev --no-audit --no-fund', { cwd: appDir, stdio: 'inherit' });
  cpSync(path.join(REPO_DIR, 'LICENSE'), path.join(STAGE_DIR, 'LICENSES', 'morgue-file.txt'));
}

/**
 * Copies ffmpeg.exe and ffprobe.exe from their pinned dev dependencies into bin\, where the app
 * looks first (src/core/jobs/workers/media-tools.ts). Both builds are GPL-3.0. ffmpeg-static
 * ships that license text; the ffprobe build (from @ffprobe-installer/win32-x64) ships none, so a
 * note naming its source goes beside it.
 */
function addMediaTools(): void {
  // Both packages are CommonJS modules whose export is the binary's path.
  const loadPackage = createRequire(import.meta.url);
  const ffmpeg = loadPackage('ffmpeg-static') as string | null;
  const ffprobe = (loadPackage('@ffprobe-installer/ffprobe') as { path: string }).path;
  if (ffmpeg === null) {
    throw new Error('ffmpeg-static has no binary for this system; run npm ci again.');
  }
  cpSync(ffmpeg, path.join(STAGE_DIR, 'bin', 'ffmpeg.exe'));
  cpSync(ffprobe, path.join(STAGE_DIR, 'bin', 'ffprobe.exe'));
  // ffmpeg-static saves the license beside the binary as <binary>.LICENSE (ffmpeg.exe.LICENSE).
  cpSync(`${ffmpeg}.LICENSE`, path.join(STAGE_DIR, 'LICENSES', 'ffmpeg-and-ffprobe.txt'));
  writeFileSync(
    path.join(STAGE_DIR, 'LICENSES', 'ffprobe-source.txt'),
    "bin\\ffprobe.exe is the FFmpeg project's ffprobe (GPL-3.0, see ffmpeg-and-ffprobe.txt), " +
      'as built by the npm package @ffprobe-installer/win32-x64: ' +
      'https://www.npmjs.com/package/@ffprobe-installer/win32-x64\n',
  );
}

/** Renders README.md into README.html, so the instructions open in any browser. */
function addReadme(): void {
  const body = marked.parse(readFileSync(path.join(REPO_DIR, 'README.md'), 'utf8'), {
    async: false,
  });
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Morgue File: how to install and use it</title>
<style>body { max-width: 50em; margin: 2em auto; padding: 0 1em; font-family: verdana, arial, sans-serif; line-height: 1.5; }</style>
</head><body>
${body}</body></html>
`;
  writeFileSync(path.join(STAGE_DIR, 'README.html'), html);
}

/** Copies the two double-click files from packaging/. */
function addLaunchers(): void {
  for (const file of ['Morgue File.cmd', 'Install shortcuts.cmd']) {
    cpSync(path.join(REPO_DIR, 'packaging', file), path.join(STAGE_DIR, file));
  }
}

/** Zips the staged folder and writes the zip's SHA-256 beside it. */
function writeZip(version: string): string {
  const zipName = `MorgueFile-${version}-win-x64.zip`;
  execFileSync(WINDOWS_TAR, ['-a', '-cf', zipName, 'MorgueFile'], { cwd: RELEASE_DIR });
  const zipPath = path.join(RELEASE_DIR, zipName);
  const hash = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
  writeFileSync(`${zipPath}.sha256`, `${hash}  ${zipName}\n`);
  return zipPath;
}

/** Builds the zip from a clean release/ folder. */
async function packageForWindows(): Promise<void> {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('Run this on 64-bit Windows: it installs Windows builds of native modules.');
  }
  rmSync(RELEASE_DIR, { recursive: true, force: true });
  mkdirSync(STAGE_DIR, { recursive: true });
  addApp();
  await addNodeRuntime();
  addMediaTools();
  addReadme();
  addLaunchers();
  const zipPath = writeZip(readAppVersion());
  console.info(`Packaged ${zipPath}`);
}

await packageForWindows();
