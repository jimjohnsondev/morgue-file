// Starts the server on the first free port and claims the data folder. Used by main.ts and the
// launcher, so tests and the shortcut start the server the same way.
import { AppError, systemErrorCode } from '#core/errors.js';

import { buildApp } from './app.js';
import { claimDataFolder, releaseLockSync } from './install/lock-file.js';
import { createLibraryRuntime } from './library-runtime.js';

import type { ServerConfig } from './config.js';
import type { InstallStateHolder } from './install/install-state.js';
import type { LibraryRuntime } from './library-runtime.js';
import type { FastifyInstance } from 'fastify';

/** How to start: the config without a port, the install state, and the ports to try in order. */
export type RunOptions = {
  readonly config: Omit<ServerConfig, 'port'>;
  readonly install: InstallStateHolder;
  readonly ports: readonly number[];
  readonly logger?: boolean;
};

/** The listen errors that mean "this port is taken, try the next one". */
const PORT_BUSY_CODES: ReadonlySet<string> = new Set(['EADDRINUSE', 'EACCES']);

/** A listening server, the port it got, and how to stop it and give up the data folder. */
export type RunningServer = {
  readonly app: FastifyInstance;
  readonly port: number;
  /** The library, started once the data folder is known; tests wait on its indexing. */
  readonly library: LibraryRuntime;
  readonly stop: () => Promise<void>;
};

type ListeningApp = Omit<RunningServer, 'stop' | 'library'>;

/**
 * Listens on the first port that is free. The app is built per port because its Host check
 * needs to know the port it answers on.
 */
async function listenOnFirstFreePort(
  options: RunOptions,
  library: LibraryRuntime,
): Promise<ListeningApp> {
  for (const port of options.ports) {
    const app = await buildApp({
      config: { ...options.config, port },
      install: options.install,
      logger: options.logger ?? true,
      library,
    });
    try {
      await app.listen({ host: options.config.host, port });
      return { app, port };
    } catch (error) {
      await app.close();
      // Windows reports ports in a reserved range (Hyper-V, WSL, Docker) as EACCES.
      if (!PORT_BUSY_CODES.has(systemErrorCode(error) ?? '')) {
        throw error;
      }
    }
  }
  throw new AppError(
    'no-free-port',
    `Ports ${options.ports.join(', ')} are all in use. Close the program using them and try again.`,
  );
}

/** Removes the lock if this server holds it. */
function releaseLock(install: InstallStateHolder): void {
  const state = install.current;
  if (state.kind === 'ready') {
    releaseLockSync(state.dataDir, process.pid);
  }
}

/** The signals that end the server: Ctrl+C, and closing its console window (SIGHUP on Windows). */
const STOP_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] as const;

/**
 * Removes this server's lock when the process ends, and returns a function that undoes the
 * hooks, for a server stopped while the process carries on (tests).
 */
function releaseLockOnExit(install: InstallStateHolder): () => void {
  function onExit(): void {
    releaseLock(install);
  }
  function onSignal(): void {
    process.exit(0);
  }
  process.on('exit', onExit);
  for (const signal of STOP_SIGNALS) {
    process.on(signal, onSignal);
  }
  return () => {
    process.off('exit', onExit);
    for (const signal of STOP_SIGNALS) {
      process.off(signal, onSignal);
    }
  };
}

/**
 * Starts the server. If setup has already run, it locks the data folder, saves the port and
 * starts indexing once the server is listening, so the first page never waits on the scan.
 */
export async function runServer(options: RunOptions): Promise<RunningServer> {
  const library = createLibraryRuntime({
    appDir: options.config.appDir,
    appVersion: options.config.version,
  });
  const { app, port } = await listenOnFirstFreePort(options, library);
  const removeExitHooks = releaseLockOnExit(options.install);
  const state = options.install.current;
  if (state.kind === 'ready') {
    await claimDataFolder(state.dataDir, port);
    library.start(state, app.log);
  }
  async function stop(): Promise<void> {
    removeExitHooks();
    await library.stop();
    releaseLock(options.install);
    await app.close();
  }
  return { app, port, library, stop };
}
