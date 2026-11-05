// /events and /api/indexing: open pages get the indexing bar (E5) and the offline band (E3) as
// they change, and their Pause, Resume and Check again buttons reach the runtime.
import { createServer } from 'node:net';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { REFERENCE_ROOT_ID, setRootStatus } from '#core/db/repositories/roots.js';
import { buildApp } from '#server/app.js';
import { findAppDir, LOOPBACK_HOST } from '#server/config.js';

import { makeTempLibrary } from '../support/temp-library.ts';

import type { IndexingAction, IndexingProgress, LibraryRuntime } from '#server/library-runtime.js';
import type { TempLibrary } from '../support/temp-library.ts';
import type { FastifyInstance } from 'fastify';

const TOKEN = 'test-token';

let port: number;
let library: TempLibrary;
let app: FastifyInstance;
let indexing: IndexingProgress | undefined;
let actions: IndexingAction[];
let isClosed = false;

/** The HTML /events sends for each slot. */
type SlotHtml = { readonly bands: string; readonly footer: string };

/** Finds a free port, since the Host check needs the app to know the port it listens on. */
async function findFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, LOOPBACK_HOST, resolve));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  if (address === null || typeof address === 'string') {
    throw new Error('No port');
  }
  return address.port;
}

/** Opens /events and returns a reader for its `status` events, and how to close it. */
async function openEvents(): Promise<{ next: () => Promise<SlotHtml>; close: () => void }> {
  const aborting = new AbortController();
  const response = await fetch(`http://127.0.0.1:${String(port)}/events`, {
    signal: aborting.signal,
  });
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = '';
  async function next(): Promise<SlotHtml> {
    for (;;) {
      const match = /event: status\ndata: (.*)\n\n/.exec(buffered);
      if (match !== null) {
        buffered = buffered.slice(match.index + match[0].length);
        return JSON.parse(match[1]!) as SlotHtml;
      }
      const { value } = await reader.read();
      buffered += value ?? '';
    }
  }
  return {
    next,
    close: () => {
      aborting.abort();
    },
  };
}

beforeAll(async () => {
  port = await findFreePort();
  library = await makeTempLibrary('E:\\Reference');
  const runtime: LibraryRuntime = {
    open: () => ({
      db: library.db,
      thumbnails: {
        db: library.db,
        thumbsDir: path.join(library.dataDir, 'thumbs'),
        mediaTools: undefined,
      },
      wakeQueue: () => undefined,
    }),
    start: () => undefined,
    indexing: () => indexing,
    controlIndexing: async (action) => {
      actions.push(action);
      await Promise.resolve();
    },
    whenIndexed: () => Promise.resolve(),
    stop: () => Promise.resolve(),
  };
  app = await buildApp({
    config: {
      host: LOOPBACK_HOST,
      port,
      appDir: findAppDir(),
      homeDir: findAppDir(),
      version: '0.0.0-test',
    },
    install: {
      current: { kind: 'ready', dataDir: library.dataDir, referenceDir: 'E:\\Reference' },
    },
    token: TOKEN,
    library: runtime,
  });
  await app.listen({ host: LOOPBACK_HOST, port });
});

beforeEach(() => {
  indexing = undefined;
  actions = [];
  setRootStatus(library.db, REFERENCE_ROOT_ID, 'online');
});

afterAll(async () => {
  if (!isClosed) {
    await app.close();
  }
  await library.remove();
});

describe('E5: live progress over /events', () => {
  it('sends the bar and footer lines, and sends them again as the scan moves on', async () => {
    indexing = { found: 12_400, expected: 48_000, isPaused: false };
    const events = await openEvents();
    const first = await events.next();
    expect(first.bands).toContain('<b>Indexing 12,400 of 48,000 files</b>');
    expect(first.bands).toContain('data-indexing-action="pause"');
    expect(first.footer).toContain('<span class="counter">12,400</span> files found so far');

    indexing = { found: 13_000, expected: 48_000, isPaused: true };
    const second = await events.next();
    expect(second.bands).toContain('<b>Indexing paused at 13,000 of 48,000 files</b>');
    expect(second.bands).toContain('data-indexing-action="resume"');

    indexing = undefined;
    expect(await events.next()).toEqual({ bands: '', footer: '' });
    events.close();
  });
});

describe('E3: the offline band over /events', () => {
  it('sends the band when the Reference folder goes offline, with a working Check again', async () => {
    const events = await openEvents();
    expect((await events.next()).bands).toBe('');
    setRootStatus(library.db, REFERENCE_ROOT_ID, 'offline');
    const offline = await events.next();
    expect(offline.bands).toContain('Reference folder (E:\\Reference) is offline.');
    expect(offline.bands).toContain('data-indexing-action="check"');
    events.close();
  });
});

describe('Pause, Resume and Check again', () => {
  it('passes each action to the runtime', async () => {
    for (const action of ['pause', 'resume', 'check'] as const) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/indexing/${action}`,
        headers: {
          host: `127.0.0.1:${String(port)}`,
          origin: `http://127.0.0.1:${String(port)}`,
          'x-morgue-token': TOKEN,
        },
      });
      expect(response.statusCode).toBe(204);
    }
    expect(actions).toEqual(['pause', 'resume', 'check']);
  });

  it('refuses a write without the token, and an action it does not know', async () => {
    const host = `127.0.0.1:${String(port)}`;
    const origin = `http://${host}`;
    const noToken = await app.inject({
      method: 'POST',
      url: '/api/indexing/pause',
      headers: { host, origin },
    });
    expect(noToken.statusCode).toBe(403);
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/indexing/delete',
      headers: { host, origin, 'x-morgue-token': TOKEN },
    });
    expect(unknown.statusCode).toBe(400);
    expect(actions).toEqual([]);
  });
});

describe('closing the server', () => {
  it('ends open event streams rather than waiting for the pages to close them', async () => {
    const events = await openEvents();
    await events.next();
    const closing = (async () => {
      await app.close();
      return 'closed';
    })();
    const stuck = new Promise((resolve) => {
      setTimeout(() => {
        resolve('stuck');
      }, 3000);
    });
    expect(await Promise.race([closing, stuck])).toBe('closed');
    isClosed = true;
    events.close();
  });
});
