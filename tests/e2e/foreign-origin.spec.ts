// R27: a page served from another origin can't read from or write to the archive server.
import { createServer } from 'node:http';

import { expect, test } from '@playwright/test';

import type { Page } from '@playwright/test';
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

/** Sends a no-cors request from the foreign page and returns the status the server answered. */
async function statusSeenByServer(
  page: Page,
  url: string,
  method: 'GET' | 'POST',
): Promise<number> {
  const response = page.waitForResponse((candidate) => candidate.url() === url);
  await page.evaluate(
    async ({ target, verb }) => {
      // The result is opaque to the page either way; only the server's answer matters here.
      await fetch(target, { method: verb, mode: 'no-cors' }).catch(() => undefined);
    },
    { target: url, verb: method },
  );
  return (await response).status();
}

test('R27: a request from a foreign web page is refused', async ({ page, baseURL }) => {
  const appUrl = baseURL ?? '';
  await page.goto(foreignUrl);

  // A page on another site can still send requests; the server must refuse them itself.
  expect(await statusSeenByServer(page, `${appUrl}/healthz`, 'GET')).toBe(403);
  expect(await statusSeenByServer(page, `${appUrl}/api/anything`, 'POST')).toBe(403);
});

test('R27: a foreign page cannot read the archive server', async ({ page, baseURL }) => {
  const appUrl = baseURL ?? '';
  await page.goto(foreignUrl);

  const readable = await page.evaluate(async (target) => {
    try {
      await fetch(`${target}/healthz`);
      return true;
    } catch {
      return false;
    }
  }, appUrl);

  // No CORS headers are sent, so even an allowed response could never be read.
  expect(readable).toBe(false);
});
