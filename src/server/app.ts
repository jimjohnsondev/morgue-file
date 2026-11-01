// Builds the Fastify app: security hooks, error handling and routes. main.ts starts it.
import path from 'node:path';

import Fastify from 'fastify';

import { loadPageAssets } from './assets.js';
import { registerErrorHandler } from './error-handler.js';
import { registerAssetRoute } from './routes/assets.js';
import { registerHealthRoute } from './routes/healthz.js';
import { registerHomeRoute } from './routes/pages/home.js';
import { createLaunchToken, registerSecurityHooks } from './security/security-hooks.js';

import type { ServerConfig } from './config.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

/** Options for building the app. Tests pass a fixed token and turn logging off. */
export type BuildAppOptions = {
  readonly config: ServerConfig;
  readonly token?: string;
  readonly logger?: boolean;
};

/** Creates the app with every route registered, ready to listen or to inject requests into. */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = options;
  const app = Fastify({ logger: options.logger ?? false }).withTypeProvider<TypeBoxTypeProvider>();
  const token = options.token ?? createLaunchToken();
  const clientDir = path.join(config.appDir, 'dist', 'client');
  const assets = await loadPageAssets(clientDir);

  registerSecurityHooks(app, config.port, token);
  registerErrorHandler(app);
  registerHealthRoute(app, config.version);
  registerAssetRoute(app, clientDir);
  registerHomeRoute(app, { token, assets });

  return app;
}
