// GET /assets/<name> serves the hashed CSS and script files Vite built.
import { readAsset } from '../assets.js';

import type { FastifyInstance } from 'fastify';

type AssetParams = { readonly name: string };

/** Registers GET /assets/:name. Built files never change, so they are cached forever. */
export function registerAssetRoute(app: FastifyInstance, clientDir: string): void {
  app.get<{ Params: AssetParams }>('/assets/:name', async (request, reply) => {
    const asset = await readAsset(clientDir, request.params.name);
    if (asset === undefined) {
      return reply.code(404).send();
    }
    return reply
      .type(asset.type)
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(asset.body);
  });
}
