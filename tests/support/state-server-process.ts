// Starts and stops tests/support/start-state-server.ts as a child process, for the Playwright
// specs that need a library in a state the shared e2e server can't reach.
import { spawn } from 'node:child_process';

import type { ChildProcess } from 'node:child_process';

/** How long a state server may take to index its copy and make its thumbnails. */
const STATE_SERVER_WAIT_MS = 240_000;

/** A state server and the address it answers on. */
export type StateServer = { readonly process: ChildProcess; readonly url: string };

/** Says whether a child process has ended, by itself or from a signal. */
function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

/**
 * Waits until a server answers its health check; state servers listen only once ready. Stops
 * waiting at once if the server has exited, whose error is then on the test's output.
 */
async function waitForServer(child: ChildProcess, url: string): Promise<void> {
  const deadline = Date.now() + STATE_SERVER_WAIT_MS;
  while (Date.now() < deadline) {
    if (hasExited(child)) {
      throw new Error(`The state server at ${url} exited before it was ready.`);
    }
    try {
      if ((await fetch(`${url}/healthz`)).ok) {
        return;
      }
    } catch {
      // Not listening yet: it listens only once its thumbnails are made.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The state server at ${url} didn't start.`);
}

/** Starts a state server in a state start-state-server.ts knows, on a port, and waits for it. */
export async function startStateServerProcess(state: string, port: number): Promise<StateServer> {
  const child = spawn(process.execPath, ['tests/support/start-state-server.ts'], {
    env: { ...process.env, MORGUE_STATE: state, MORGUE_PORT: String(port) },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const url = `http://127.0.0.1:${String(port)}`;
  try {
    await waitForServer(child, url);
  } catch (error) {
    child.kill();
    throw error;
  }
  return { process: child, url };
}

/** Stops a state server and waits for it to exit. */
export async function stopStateServer(server: StateServer | undefined): Promise<void> {
  if (server === undefined || hasExited(server.process)) {
    return;
  }
  const exited = new Promise((resolve) => server.process.once('exit', resolve));
  server.process.kill();
  await exited;
}
