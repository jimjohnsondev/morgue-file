// Server settings. Every path is resolved from the app folder, never the current directory.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The loopback address the server binds to. Never 0.0.0.0 or :: (PRD R27). */
export const LOOPBACK_HOST = '127.0.0.1';

/** The default port, chosen because other software seldom uses it. */
export const DEFAULT_PORT = 47613;

/** The last port the launcher tries when the ones before it are taken. */
export const LAST_PORT = 47622;

/** Settings the server needs to start. */
export type ServerConfig = {
  readonly host: typeof LOOPBACK_HOST;
  readonly port: number;
  /** The folder holding package.json and dist\ (app\ in the release zip). */
  readonly appDir: string;
  /** The folder holding morgue-file.json and, by default, data\ (the unzipped MorgueFile\). */
  readonly homeDir: string;
  readonly version: string;
};

/**
 * Finds the app folder from this file's location, so the server works when
 * started from a shortcut whose working directory is somewhere else.
 */
export function findAppDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  // This file sits at <app>/src/server/config.ts or <app>/dist/server/config.js.
  return path.resolve(path.dirname(thisFile), '..', '..');
}

/**
 * Finds the home folder. Morgue File.cmd sets MORGUE_HOME to its own folder, the parent of
 * app\; a development checkout has no launcher, so the repo itself is the home folder.
 */
export function findHomeDir(appDir: string): string {
  const fromLauncher = process.env.MORGUE_HOME;
  return fromLauncher === undefined || fromLauncher === '' ? appDir : path.resolve(fromLauncher);
}

/** Reads the version from package.json, so /healthz reports what release-please set. */
export function readVersion(appDir: string): string {
  const packagePath = path.join(appDir, 'package.json');
  const parsed = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: string };
  return parsed.version ?? '0.0.0';
}

/** The port tests ask for with MORGUE_PORT, or undefined to use the normal range. */
export function readPortOverride(): number | undefined {
  const override = process.env.MORGUE_PORT;
  return override === undefined ? undefined : Number.parseInt(override, 10);
}

/** The ports to try in order: the preferred one, then the rest of the range (R29). */
export function candidatePorts(preferred: number): number[] {
  const ports = [preferred];
  for (let port = DEFAULT_PORT; port <= LAST_PORT; port++) {
    if (port !== preferred) {
      ports.push(port);
    }
  }
  return ports;
}
