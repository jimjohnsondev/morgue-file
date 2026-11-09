// Builds the Fastify app: security hooks, error handling and routes. run.ts starts it.
import path from 'node:path';

import Fastify from 'fastify';

import { loadPageAssets } from './assets.js';
import { registerErrorHandler } from './error-handler.js';
import { registerFieldApi } from './routes/api/fields.js';
import { registerHistoryApi } from './routes/api/history.js';
import { registerIndexingApi } from './routes/api/indexing.js';
import { registerIngestApi } from './routes/api/ingest.js';
import { registerItemFieldApi } from './routes/api/item-fields.js';
import { registerModelLinkApi } from './routes/api/model-links.js';
import { registerModelProfileApi } from './routes/api/model-profiles.js';
import { registerOrganizeApi } from './routes/api/organize.js';
import { registerSetupApi } from './routes/api/setup.js';
import { registerSubcategoryApi } from './routes/api/subcategories.js';
import { registerWatchedFolderApi } from './routes/api/watched-folders.js';
import { registerAssetRoute } from './routes/assets.js';
import { registerEventsRoute } from './routes/events.js';
import { registerHealthRoute } from './routes/healthz.js';
import { registerOriginalRoutes } from './routes/media-originals.js';
import { registerMediaRoutes } from './routes/media.js';
import { registerCardListRoutes } from './routes/pages/card-lists.js';
import { registerHomeRoute } from './routes/pages/home.js';
import { registerIndexRoutes } from './routes/pages/index-routes.js';
import { registerItemRoute } from './routes/pages/item-route.js';
import { registerModelEditRoute } from './routes/pages/model-edit-route.js';
import { registerModelRoute } from './routes/pages/model-route.js';
import { registerSearchRoute } from './routes/pages/search-route.js';
import { registerSearchTipsRoute } from './routes/pages/search-tips-route.js';
import { registerSettingsPage } from './routes/pages/settings-route.js';
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

/** The JSON routes that read or change the library: indexing, ingest, organizing and fields. */
function registerLibraryApis(app: FastifyInstance, library: LibraryRuntime | undefined): void {
  registerIndexingApi(app, library);
  registerHistoryApi(app, library);
  registerIngestApi(app, library);
  registerSubcategoryApi(app, library);
  registerOrganizeApi(app, library);
  registerModelLinkApi(app, library);
  registerModelProfileApi(app, library);
  registerFieldApi(app, library);
  registerItemFieldApi(app, library);
}

/** Creates the app with every route registered, ready to listen or to inject requests into. */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config, install, library } = options;
  // Closing ends every connection, including pages' open /events streams, which would otherwise
  // keep the server from closing.
  const app = Fastify({
    logger: options.logger ?? false,
    forceCloseConnections: true,
  }).withTypeProvider<TypeBoxTypeProvider>();
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
  registerCardListRoutes(app, pageContext);
  registerModelRoute(app, pageContext);
  registerModelEditRoute(app, pageContext);
  registerSearchRoute(app, pageContext);
  registerSearchTipsRoute(app, pageContext);
  registerItemRoute(app, pageContext);
  registerSettingsPage(app, pageContext);
  registerMediaRoutes(app, library);
  registerOriginalRoutes(app, library);
  registerEventsRoute(app, library);
  registerLibraryApis(app, library);
  registerWatchedFolderApi(app, { homeDir: config.homeDir, install, library });

  return app;
}
