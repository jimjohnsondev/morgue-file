import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '#server/app.js';
import { findAppDir, LOOPBACK_HOST } from '#server/config.js';

import type { ServerConfig } from '#server/config.js';
import type { FastifyInstance } from 'fastify';

const PORT = 47613;
const TOKEN = 'test-token';
const OWN_HOST = `127.0.0.1:${String(PORT)}`;

const config: ServerConfig = {
  host: LOOPBACK_HOST,
  port: PORT,
  appDir: findAppDir(),
  version: '0.0.0-test',
};

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ config, token: TOKEN });
});

afterAll(async () => {
  await app.close();
});

describe('health check', () => {
  it('answers with the app name and version', async () => {
    const response = await app.inject({ url: '/healthz', headers: { host: OWN_HOST } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ app: 'morgue-file', version: '0.0.0-test' });
  });
});

describe('home page', () => {
  it('renders an HTML page with the tab bar and the launch token', async () => {
    const response = await app.inject({ url: '/', headers: { host: OWN_HOST } });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toMatch(/^<!DOCTYPE html>/);
    expect(response.body).toContain('MORGUE');
    expect(response.body).toContain('<meta name="morgue-token" content="test-token"/>');
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
  });
});

describe('R27: requests from another device or a foreign page are refused', () => {
  it('refuses an unexpected Host header (DNS rebinding)', async () => {
    const response = await app.inject({ url: '/', headers: { host: 'evil.example:47613' } });
    expect(response.statusCode).toBe(403);
  });

  it('refuses a cross-site fetch', async () => {
    const response = await app.inject({
      url: '/healthz',
      headers: { host: OWN_HOST, 'sec-fetch-site': 'cross-site' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('refuses a write without the origin and token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/healthz',
      headers: { host: OWN_HOST, origin: 'http://127.0.0.1:47613' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('lets a write with the origin and token through to routing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/healthz',
      headers: { host: OWN_HOST, origin: 'http://127.0.0.1:47613', 'x-morgue-token': TOKEN },
    });
    // No POST route exists yet, so passing the checks means a 404, not a 403.
    expect(response.statusCode).toBe(404);
  });

  it('listens on 127.0.0.1 only', async () => {
    const listening = await buildApp({ config, token: TOKEN });
    await listening.listen({ host: config.host, port: 0 });
    const addresses = listening.addresses();
    await listening.close();
    expect(addresses.map((address) => address.address)).toEqual(['127.0.0.1']);
  });
});
