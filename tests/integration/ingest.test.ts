// R2 through the API: files dropped or pasted onto a page are saved to the Inbox, indexed at
// once into Unsorted with their source address, and web addresses dragged with no file are
// fetched within the Security limits.
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { findItemById } from '#core/db/repositories/items.js';
import { findJob } from '#core/db/repositories/jobs.js';
import { REFERENCE_ROOT_ID, setReferenceRoot, setRootStatus } from '#core/db/repositories/roots.js';
import { readFieldValues } from '#core/fields/fields.js';
import { reconcileEntries } from '#core/indexer/reconcile.js';
import { walkRoot } from '#core/indexer/walk.js';
import { inboxMonthFolder, ingestUrl } from '#core/ingest/ingest.js';
import { buildApp } from '#server/app.js';
import { findAppDir, LOOPBACK_HOST } from '#server/config.js';

import { makeTempLibrary } from '../support/temp-library.js';

import type { LibraryRuntime } from '#server/library-runtime.js';
import type { TempLibrary } from '../support/temp-library.js';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'node:http';

const PORT = 47613;
const ORIGIN = `http://127.0.0.1:${String(PORT)}`;
const TOKEN = 'test-token';

/** Headers a page of the app sends with a write. */
const OWN_PAGE = { host: `127.0.0.1:${String(PORT)}`, origin: ORIGIN, 'x-morgue-token': TOKEN };

let referenceDir: string;
let library: TempLibrary;
let app: FastifyInstance;
let wakes: number;

/** A small file server on this PC, standing in for a website in the fetch tests. */
let site: Server;
let siteUrl: string;

/** The Inbox folder files saved now go in. */
function inboxDir(): string {
  return path.join(referenceDir, 'Inbox', inboxMonthFolder(new Date()));
}

/** Posts one file's bytes as a page does. */
async function postFile(name: string, bytes: string, source?: string) {
  const query = new URLSearchParams({ name, ...(source === undefined ? {} : { source }) });
  return app.inject({
    method: 'POST',
    url: `/api/ingest?${query.toString()}`,
    headers: { ...OWN_PAGE, 'content-type': 'application/octet-stream' },
    payload: bytes,
  });
}

/** The source address stored on an item, if any. */
function sourceUrlOf(itemId: number): unknown {
  const fields = readFieldValues(library.db, { entity: 'item', entityId: itemId });
  return fields.find((entry) => entry.field.key === 'source_url')?.value;
}

/** Answers like a website: a picture, a redirect to it, a page, and a file that never ends. */
async function startSite(): Promise<void> {
  site = createServer((request, response) => {
    const route = request.url ?? '';
    if (route === '/pictures/hand%20study.jpg' || route === '/pictures/render?id=7') {
      response.writeHead(200, { 'content-type': 'image/jpeg' }).end('jpeg bytes');
    } else if (route === '/short-link') {
      response.writeHead(302, { location: '/pictures/hand%20study.jpg' }).end();
    } else if (route === '/page.html') {
      response.writeHead(200, { 'content-type': 'text/html' }).end('<p>hi</p>');
    } else if (route === '/huge.mp4') {
      response.writeHead(200, { 'content-type': 'video/mp4' }).end(Buffer.alloc(4096));
    } else if (route === '/unsized.mp4') {
      // Sent in chunks with no Content-Length, so only counting the bytes finds it too large.
      response.writeHead(200, { 'content-type': 'video/mp4' });
      response.write(Buffer.alloc(800));
      response.end(Buffer.alloc(800));
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => site.listen(0, LOOPBACK_HOST, resolve));
  const address = site.address();
  if (address === null || typeof address === 'string') {
    throw new Error('No port');
  }
  siteUrl = `http://127.0.0.1:${String(address.port)}`;
}

beforeAll(async () => {
  referenceDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-ingest-'));
  library = await makeTempLibrary(referenceDir);
  const runtime: LibraryRuntime = {
    open: () => ({
      db: library.db,
      thumbnails: {
        db: library.db,
        thumbsDir: path.join(library.dataDir, 'thumbs'),
        mediaTools: undefined,
      },
      wakeQueue: () => {
        wakes += 1;
      },
    }),
    start: () => undefined,
    indexing: () => undefined,
    controlIndexing: () => Promise.resolve(),
    whenIndexed: () => Promise.resolve(),
    stop: () => Promise.resolve(),
  };
  app = await buildApp({
    config: {
      host: LOOPBACK_HOST,
      port: PORT,
      appDir: findAppDir(),
      homeDir: findAppDir(),
      version: '0.0.0-test',
    },
    install: { current: { kind: 'ready', dataDir: library.dataDir, referenceDir } },
    token: TOKEN,
    library: runtime,
  });
  await startSite();
});

beforeEach(async () => {
  wakes = 0;
  setReferenceRoot(library.db, referenceDir);
  setRootStatus(library.db, REFERENCE_ROOT_ID, 'online');
  await rm(path.join(referenceDir, 'Inbox'), { recursive: true, force: true });
  await mkdir(path.join(referenceDir, 'Inbox'));
});

afterAll(async () => {
  await app.close();
  await new Promise((resolve) => site.close(resolve));
  await library.remove();
  await rm(referenceDir, { recursive: true, force: true });
});

describe('R2: dropped and pasted files', () => {
  it('R2: a dropped file is saved to Inbox/YYYY-MM and listed in Unsorted at once', async () => {
    const response = await postFile('hand_study.jpg', 'jpeg bytes');
    expect(response.statusCode).toBe(201);
    const { itemId } = response.json<{ itemId: number }>();

    expect(await readFile(path.join(inboxDir(), 'hand_study.jpg'), 'utf8')).toBe('jpeg bytes');
    const item = findItemById(library.db, itemId);
    expect(item?.relPath).toBe(`Inbox/${inboxMonthFolder(new Date())}/hand_study.jpg`);
    expect(item?.subcategoryId).toBeUndefined();
    expect(findJob(library.db, itemId, 'thumb-image')?.priority).toBe(1);
    expect(wakes).toBe(1);

    const unsorted = await app.inject({ url: '/unsorted', headers: { host: OWN_PAGE.host } });
    expect(unsorted.body).toContain('hand_study.jpg');
  });

  it('R2: browser drags keep the source URL when the browser provides it', async () => {
    const source = 'https://example.com/studies/hand.html';
    const response = await postFile('hand.jpg', 'jpeg bytes', source);
    const { itemId } = response.json<{ itemId: number }>();
    expect(sourceUrlOf(itemId)).toBe(source);

    const page = await app.inject({
      url: `/photos?saved=${String(itemId)}`,
      headers: { host: OWN_PAGE.host },
    });
    expect(page.body).toContain('Saved to Unsorted');
    expect(page.body).toContain('from example.com');
  });

  it('R2: a source that is not a web address is left out, and the file still saved', async () => {
    const response = await postFile('pasted.png', 'png bytes', 'data:image/png;base64,AAAA');
    expect(response.statusCode).toBe(201);
    expect(sourceUrlOf(response.json<{ itemId: number }>().itemId)).toBeUndefined();
  });

  it('R2: a name already taken gets " (2)", ignoring case, and nothing is overwritten', async () => {
    const first = await postFile('image.png', 'first');
    const second = await postFile('IMAGE.png', 'second');
    const third = await postFile('image.png', 'third');
    expect([first.statusCode, second.statusCode, third.statusCode]).toEqual([201, 201, 201]);
    expect((await readdir(inboxDir())).sort()).toEqual(
      ['image.png', 'IMAGE (2).png', 'image (3).png'].sort(),
    );
    expect(await readFile(path.join(inboxDir(), 'image.png'), 'utf8')).toBe('first');
  });

  it('R2: a name is cleaned for Windows and can never leave the Inbox', async () => {
    const response = await postFile('..\\..\\Figure\\what: now?.jpg', 'jpeg bytes');
    expect(response.statusCode).toBe(201);
    expect(await readdir(inboxDir())).toEqual(['what_ now_.jpg']);
    expect(await readdir(referenceDir)).toEqual(['Inbox']);
  });

  it('a scan that listed the folder before the drop adds no second item for the file', async () => {
    const { itemId } = (await postFile('hand.jpg', 'jpeg bytes')).json<{ itemId: number }>();
    const run = {
      db: library.db,
      rootId: REFERENCE_ROOT_ID,
      rootPath: referenceDir,
      now: new Date(),
    };
    // Stored states read before the drop: the pass doesn't know the item yet.
    const summary = await reconcileEntries(
      run,
      walkRoot(referenceDir, {
        startDir: `Inbox/${inboxMonthFolder(new Date())}`,
        isShallow: true,
      }),
      [],
    );
    expect(summary.missing).toBe(0);
    expect(findItemById(library.db, itemId)?.relPath).toContain('hand.jpg');
    expect(findJob(library.db, itemId, 'thumb-image')?.priority).toBe(1);
  });

  it('refuses a file the archive does not keep, writing nothing', async () => {
    const response = await postFile('notes.txt', 'text');
    expect(response.statusCode).toBe(415);
    expect(response.json<{ message: string }>().message).toContain('.txt');
    expect(await readdir(path.join(referenceDir, 'Inbox'))).toEqual([]);
  });

  it('refuses while the Reference folder is offline, writing nothing', async () => {
    setRootStatus(library.db, REFERENCE_ROOT_ID, 'offline');
    expect((await postFile('hand.jpg', 'jpeg bytes')).statusCode).toBe(503);
    setRootStatus(library.db, REFERENCE_ROOT_ID, 'online');
    setReferenceRoot(library.db, path.join(referenceDir, 'Unplugged'));
    expect((await postFile('hand.jpg', 'jpeg bytes')).statusCode).toBe(503);
    expect(await readdir(referenceDir)).toEqual(['Inbox']);
  });

  it('R27: refuses a write without the launch token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/ingest?name=hand.jpg',
      headers: { host: OWN_PAGE.host, origin: ORIGIN, 'content-type': 'application/octet-stream' },
      payload: 'jpeg bytes',
    });
    expect(response.statusCode).toBe(403);
    expect(await readdir(path.join(referenceDir, 'Inbox'))).toEqual([]);
  });
});

describe('R2: web addresses dragged with no file', () => {
  /** Saves a dragged address through the API. */
  async function postUrl(url: string) {
    return app.inject({
      method: 'POST',
      url: '/api/ingest/url',
      headers: { ...OWN_PAGE, 'content-type': 'application/json' },
      payload: { url },
    });
  }

  it('refuses addresses on this PC or the local network', async () => {
    for (const url of [
      `${siteUrl}/pictures/hand%20study.jpg`,
      'http://localhost:47613/healthz',
      'http://[::1]/a.jpg',
      'http://192.168.1.10/a.jpg',
      'http://169.254.169.254/latest/meta-data',
    ]) {
      const response = await postUrl(url);
      expect(response.statusCode, url).toBe(400);
      expect(response.json<{ error: string }>().error, url).toBe('fetch-refused');
    }
    expect(await readdir(path.join(referenceDir, 'Inbox'))).toEqual([]);
  });

  it('refuses an address whose host does not resolve, and keeps answering', async () => {
    const response = await postUrl('http://no-such-host.invalid/a.jpg');
    expect(response.statusCode).toBe(502);
    expect(response.json<{ error: string }>().error).toBe('fetch-failed');
    expect(
      (await app.inject({ url: '/healthz', headers: { host: OWN_PAGE.host } })).statusCode,
    ).toBe(200);
  });

  it('refuses addresses that are not http or https', async () => {
    const response = await postUrl('file:///C:/Windows/win.ini');
    expect(response.json<{ error: string }>().error).toBe('fetch-refused');
  });

  /** What the fetch tests run with: the stand-in site on this PC is let through. */
  function context() {
    return { db: library.db, wakeQueue: () => undefined };
  }
  const ANY_ADDRESS = { isAllowedAddress: () => true };

  it('R2: fetches the file, names it from the address and keeps the address', async () => {
    const address = `${siteUrl}/pictures/hand%20study.jpg`;
    const itemId = await ingestUrl(context(), address, ANY_ADDRESS);
    expect(await readFile(path.join(inboxDir(), 'hand study.jpg'), 'utf8')).toBe('jpeg bytes');
    expect(findItemById(library.db, itemId)?.kind).toBe('image');
    expect(sourceUrlOf(itemId)).toBe(address);
  });

  it('R2: follows a redirect and names a file with no extension by its type', async () => {
    await ingestUrl(context(), `${siteUrl}/short-link`, ANY_ADDRESS);
    await ingestUrl(context(), `${siteUrl}/pictures/render?id=7`, ANY_ADDRESS);
    expect((await readdir(inboxDir())).sort()).toEqual(['hand study.jpg', 'render.jpg']);
  });

  it('refuses a page, a missing file and a file over the size limit, leaving no file', async () => {
    await expect(ingestUrl(context(), `${siteUrl}/page.html`, ANY_ADDRESS)).rejects.toThrow(
      'not an image or video',
    );
    await expect(ingestUrl(context(), `${siteUrl}/gone.jpg`, ANY_ADDRESS)).rejects.toThrow('404');
    await expect(
      ingestUrl(context(), `${siteUrl}/huge.mp4`, { ...ANY_ADDRESS, maxBytes: 1000 }),
    ).rejects.toThrow('larger than');
    await expect(
      ingestUrl(context(), `${siteUrl}/unsized.mp4`, { ...ANY_ADDRESS, maxBytes: 1000 }),
    ).rejects.toThrow('larger than');
    // The month folder may have been made for the large file; the file itself is gone.
    expect(await readdir(inboxDir())).toEqual([]);
  });
});
