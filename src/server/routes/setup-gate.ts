// Sends every page to first-run setup until setup has run (R30).
import { AppError } from '#core/errors.js';

import { loadInstallState } from '../install/install-state.js';
import { claimDataFolder } from '../install/lock-file.js';

import type { InstallStateHolder } from '../install/install-state.js';
import type { LibraryRuntime } from '../library-runtime.js';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';

/** What the gate needs: the install state, and where to look again for a missing data folder. */
export type SetupGateContext = {
  readonly homeDir: string;
  readonly port: number;
  readonly install: InstallStateHolder;
  /** Started once setup is done, so indexing begins without a restart. Tests may leave it out. */
  readonly library?: LibraryRuntime | undefined;
};

/** Paths that work before setup: the setup page and the health check. */
const OPEN_PATHS: ReadonlySet<string> = new Set(['/setup', '/healthz']);

/** Path prefixes that work before setup: the setup API and the built assets. */
const OPEN_PREFIXES = ['/api/setup/', '/assets/'] as const;

/** Says whether a request path may be served before setup has run. */
function isOpenBeforeSetup(url: string): boolean {
  const pathOnly = url.split('?')[0] ?? '';
  return OPEN_PATHS.has(pathOnly) || OPEN_PREFIXES.some((prefix) => pathOnly.startsWith(prefix));
}

/**
 * Looks again for a data folder that was missing at launch, e.g. a drive plugged in since, so
 * reloading the page is enough. Once found, the server claims it as it would at launch.
 */
async function recheckMissingDataFolder(
  context: SetupGateContext,
  log: FastifyBaseLogger,
): Promise<void> {
  if (context.install.current.kind !== 'data-missing') {
    return;
  }
  const state = await loadInstallState(context.homeDir);
  if (state.kind === 'ready') {
    await claimDataFolder(state.dataDir, context.port);
    context.library?.start(state, log);
  }
  context.install.current = state;
}

/**
 * Redirects pages to /setup while the app has no data folder, and refuses other requests, so
 * nothing runs against a library that isn't there.
 */
export function registerSetupGate(app: FastifyInstance, context: SetupGateContext): void {
  const { install } = context;
  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'GET') {
      await recheckMissingDataFolder(context, request.log);
    }
    if (install.current.kind === 'ready' || isOpenBeforeSetup(request.url)) {
      return;
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      return reply.redirect('/setup', 303);
    }
    throw new AppError('setup-required', 'Finish setting up Morgue File first.');
  });
}
