// R27: a page served from another origin can't read from or write to the archive server.
import { createServer } from 'node:http';

import { expect, test } from '@playwright/test';

import type { Server } from 'node:http';

const FOREIGN_PAGE = '<!DOCTYPE html><title>foreign</title><p>a website you happened to open</p>';

let foreignServer: Server;
let foreignUrl: string;

test.beforeAll(async () => {
  foreignServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(FOREIGN_PAGE);
  });
  await new Promise<void>((resolve) => {
    foreignServer.listen(0, '127.0.0.1', resolve);
  });
  const address = foreignServer.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The foreign test server has no port.');
  }
  // "localhost" makes this a different origin from the app's 127.0.0.1 even on the same machine.
  foreignUrl = `http://localhost:${String(address.port)}/`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => {
    foreignServer.close(() => {
      resolve();
    });
  });
});

test('R27: a request from a foreign web page is refused', async ({ page, baseURL }) => {
  const appUrl = baseURL ?? '';
  await page.goto(foreignUrl);

  const outcome = await page.evaluate(async (target) => {
    const results = { read: 'not tried', write: 'not tried' };
    try {
      await fetch(`${target}/healthz`);
      results.read = 'readable';
    } catch {
      results.read = 'blocked';
    }
    try {
      const response = await fetch(`${target}/api/anything`, { method: 'POST', mode: 'no-cors' });
      results.write = response.type;
    } catch {
      results.write = 'blocked';
    }
    return results;
  }, appUrl);

  // No CORS headers are sent, so the foreign page can't read a response.
  expect(outcome.read).toBe('blocked');
  // A no-cors write gets an opaque response at best; the server side refusal is checked below.
  expect(['opaque', 'blocked']).toContain(outcome.write);
});

test('R27: the server refuses a cross-site request even when its result is never read', async ({
  request,
}) => {
  const response = await request.get('/healthz', { headers: { 'sec-fetch-site': 'cross-site' } });
  expect(response.status()).toBe(403);
});
