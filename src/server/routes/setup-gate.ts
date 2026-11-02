// Sends every page to first-run setup until setup has run (R30).
import { AppError } from '#core/errors.js';

import type { InstallStateHolder } from '../install/install-state.js';
import type { FastifyInstance } from 'fastify';

/** URL prefixes that work before setup: the setup page and its API, assets and the health check. */
const OPEN_BEFORE_SETUP = ['/setup', '/api/setup/', '/assets/', '/healthz'] as const;

/** Says whether a request path may be served before setup has run. */
function isOpenBeforeSetup(url: string): boolean {
  const pathOnly = url.split('?')[0] ?? '';
  return OPEN_BEFORE_SETUP.some((prefix) => pathOnly === prefix || pathOnly.startsWith(prefix));
}

/**
 * Redirects pages to /setup while the app has no data folder, and refuses other requests, so
 * nothing runs against a library that isn't there.
 */
export function registerSetupGate(app: FastifyInstance, install: InstallStateHolder): void {
  app.addHook('onRequest', async (request, reply) => {
    if (install.current.kind === 'ready' || isOpenBeforeSetup(request.url)) {
      return;
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      return reply.redirect('/setup', 303);
    }
    throw new AppError('setup-required', 'Finish setting up Morgue File first.');
  });
}
