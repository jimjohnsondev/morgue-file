// Builds the Fastify app: security hooks, error handling and routes. run.ts starts it.
import path from 'node:path';

import Fastify from 'fastify';

import { loadPageAssets } from './assets.js';
import { registerErrorHandler } from './error-handler.js';
import { registerSetupApi } from './routes/api/setup.js';
import { registerAssetRoute } from './routes/assets.js';
import { registerHealthRoute } from './routes/healthz.js';
import { registerMediaRoutes } from './routes/media.js';
import { registerHomeRoute } from './routes/pages/home.js';
import { registerIndexRoutes } from './routes/pages/index-routes.js';
import { registerSearchRoute } from './routes/pages/search-route.js';
import { registerSetupPage } from './routes/pages/setup.js';
import { registerSetupGate } from './routes/setup-gate.js';
import { createLaunchToken, registerSecurityHooks } from './security/security-hooks.js';

import type { ServerConfig } from './config.js';
import type { InstallStateHolder } from './install/install-state.js';
import type { LibraryRuntime } from './library-runtime.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

/** Options for building the app. Tests pass a fixed token and turn logging off. */
export type BuildAppOptions = {
  readonly config: ServerConfig;
  readonly install: InstallStateHolder;
  readonly token?: string;
  readonly logger?: boolean;
  /** The library to start when setup finishes or a missing data folder comes back. */
  readonly library?: LibraryRuntime;
};

/** Creates the app with every route registered, ready to listen or to inject requests into. */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config, install, library } = options;
  const app = Fastify({ logger: options.logger ?? false }).withTypeProvider<TypeBoxTypeProvider>();
  const token = options.token ?? createLaunchToken();
  const clientDir = path.join(config.appDir, 'dist', 'client');
  const assets = await loadPageAssets(clientDir);
  const pageContext = { token, assets, library };

  registerSecurityHooks(app, config.port, token);
  registerSetupGate(app, { homeDir: config.homeDir, port: config.port, install, library });
  registerErrorHandler(app);
  registerHealthRoute(app, config.version);
  registerAssetRoute(app, clientDir);
  registerSetupPage(app, pageContext, install);
  registerSetupApi(app, { homeDir: config.homeDir, port: config.port, install, library });
  registerHomeRoute(app, pageContext);
  registerIndexRoutes(app, pageContext);
  registerSearchRoute(app, pageContext);
  registerMediaRoutes(app, library);

  return app;
}
