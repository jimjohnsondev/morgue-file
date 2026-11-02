// What the shortcut does (R29, R30): open the copy that is already running, or start the server
// and open the browser once it is listening.
import { DEFAULT_PORT, LOOPBACK_HOST, candidatePorts } from './config.js';
import { readDataSettings } from './install/data-folder.js';
import { loadInstallState } from './install/install-state.js';
import { isProcessRunning, readLockOwner } from './install/lock-file.js';
import { runServer } from './run.js';

import type { ServerConfig } from './config.js';
import type { InstallState } from './install/install-state.js';
import type { RunningServer } from './run.js';

const HEALTH_CHECK_TIMEOUT_MS = 1000;

/** What the launcher needs: where the app and its home folder are, and how to open a URL. */
export type LaunchOptions = {
  readonly config: Omit<ServerConfig, 'port'>;
  readonly openUrl: (url: string) => void;
  readonly logger?: boolean;
};

/** What a launch did: the URL it opened, and the server if it started one. */
export type LaunchResult = {
  readonly url: string;
  readonly server: RunningServer | undefined;
};

/** Says whether Morgue File answers its health check on this port. */
export async function isMorgueFileAt(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://${LOOPBACK_HOST}:${String(port)}/healthz`, {
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
    });
    const body = (await response.json()) as { app?: unknown };
    return body.app === 'morgue-file';
  } catch {
    // Nothing listening, something else listening, or no answer in time: not Morgue File.
    return false;
  }
}

/** The port the last run got, saved in the data folder, or the default. */
async function findSavedPort(state: InstallState): Promise<number> {
  if (state.kind !== 'ready') {
    return DEFAULT_PORT;
  }
  return (await readDataSettings(state.dataDir)).port ?? DEFAULT_PORT;
}

/** Returns the port of a copy already serving this install: the lock's owner, or the saved port. */
async function findRunningCopy(
  state: InstallState,
  savedPort: number,
): Promise<number | undefined> {
  const ports = [savedPort];
  if (state.kind === 'ready') {
    const owner = await readLockOwner(state.dataDir);
    if (owner !== undefined && isProcessRunning(owner.pid)) {
      ports.unshift(owner.port);
    }
  }
  for (const port of ports) {
    if (await isMorgueFileAt(port)) {
      return port;
    }
  }
  return undefined;
}

/** Opens Morgue File: in the running copy if there is one, otherwise in a newly started server. */
export async function launch(options: LaunchOptions): Promise<LaunchResult> {
  const state = await loadInstallState(options.config.homeDir);
  const savedPort = await findSavedPort(state);
  const runningPort = await findRunningCopy(state, savedPort);
  if (runningPort !== undefined) {
    const url = `http://${LOOPBACK_HOST}:${String(runningPort)}/`;
    options.openUrl(url);
    return { url, server: undefined };
  }
  const server = await runServer({
    config: options.config,
    install: { current: state },
    ports: candidatePorts(savedPort),
    logger: options.logger ?? true,
  });
  const url = `http://${LOOPBACK_HOST}:${String(server.port)}/`;
  options.openUrl(url);
  return { url, server };
}
