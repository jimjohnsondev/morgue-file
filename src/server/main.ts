// Starts the server on 127.0.0.1. The launcher (PR 3) will call this after its health check.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { buildApp } from './app.js';
import { loadConfig, findAppDir } from './config.js';

/** Reads the version from package.json, so /healthz reports what release-please set. */
function readVersion(): string {
  const packagePath = path.join(findAppDir(), 'package.json');
  const parsed = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: string };
  return parsed.version ?? '0.0.0';
}

/** Builds the app and listens on the loopback address only. */
async function start(): Promise<void> {
  const config = loadConfig(readVersion());
  const app = await buildApp({ config, logger: true });
  await app.listen({ host: config.host, port: config.port });
}

await start();
