// GET /healthz tells the launcher whether Morgue File is already running on this port.
import { Type } from '@sinclair/typebox';

import type { FastifyInstance } from 'fastify';

const HealthResponse = Type.Object({
  app: Type.Literal('morgue-file'),
  version: Type.String(),
});

/** Registers GET /healthz, which answers {app, version}. */
export function registerHealthRoute(app: FastifyInstance, version: string): void {
  app.get('/healthz', { schema: { response: { 200: HealthResponse } } }, () => ({
    app: 'morgue-file' as const,
    version,
  }));
}
