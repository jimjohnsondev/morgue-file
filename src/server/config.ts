// Server settings. Every path is resolved from the app folder, never the current directory.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The loopback address the server binds to. Never 0.0.0.0 or :: (PRD R27). */
export const LOOPBACK_HOST = '127.0.0.1';

/** The default port, chosen because other software seldom uses it. */
export const DEFAULT_PORT = 47613;

/** Settings the server needs to start. */
export type ServerConfig = {
  readonly host: typeof LOOPBACK_HOST;
  readonly port: number;
  readonly appDir: string;
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

/** Builds the config from defaults and the MORGUE_PORT override used by tests. */
export function loadConfig(version: string): ServerConfig {
  const portOverride = process.env.MORGUE_PORT;
  const port = portOverride === undefined ? DEFAULT_PORT : Number.parseInt(portOverride, 10);
  return { host: LOOPBACK_HOST, port, appDir: findAppDir(), version };
}
