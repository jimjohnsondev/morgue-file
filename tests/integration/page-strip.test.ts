// The page reader's strip of small page pictures for CBZ files and page folders (R21): the Item
// page links each strip page to /media/page-strip/<id>/<n>, which answers a small WebP that the
// browser keeps until the original changes.
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ZipFile } from 'yazl';

import { findItemIdsByPath } from '#core/db/repositories/items.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { buildApp } from '#server/app.js';
import { findAppDir, LOOPBACK_HOST } from '#server/config.js';

import { addTestItem, makeTempLibrary } from '../support/temp-library.js';

import type { LibraryRuntime } from '#server/library-runtime.js';
import type { TempLibrary } from '../support/temp-library.js';
import type { FastifyInstance } from 'fastify';

const PORT = 47613;
const HOST = `127.0.0.1:${String(PORT)}`;

/** The size of the fixture's page scans; the strip's pictures are much smaller. */
const SCAN = { width: 560, height: 760 } as const;

let referenceDir: string;
let library: TempLibrary;
let app: FastifyInstance;
let ids: Map<string, number>;

/** A page scan: a plain PNG of one gray, so each page differs. */
async function pageScan(gray: number): Promise<Buffer> {
  return sharp({
    create: { ...SCAN, channels: 3, background: { r: gray, g: gray, b: gray } },
  })
    .png()
    .toBuffer();
}

/** Writes a page folder of three scans (the third not a picture at all) and a CBZ of two. */
async function writeOriginals(): Promise<void> {
  const folder = path.join(referenceDir, 'Books', 'Folder Book');
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, '001.png'), await pageScan(40));
  await writeFile(path.join(folder, '002.png'), await pageScan(200));
  await writeFile(path.join(folder, '003.png'), 'not a picture');
  const zip = new ZipFile();
  const written = pipeline(
    zip.outputStream,
    createWriteStream(path.join(referenceDir, 'Books', 'Zip Book.cbz')),
  );
  zip.addBuffer(await pageScan(120), '001.png');
  zip.addBuffer(await pageScan(160), '002.png');
  zip.end();
  await written;
}

/** A runtime over the test library that runs no jobs. */
function testRuntime(): LibraryRuntime {
  return {
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
    indexing: () => undefined,
    controlIndexing: () => Promise.resolve(),
    watchRoot: () => undefined,
    rescanRoot: () => undefined,
    whenIndexed: () => Promise.resolve(),
    stop: () => Promise.resolve(),
  };
}

beforeAll(async () => {
  referenceDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-reference-'));
  await writeOriginals();
  library = await makeTempLibrary(referenceDir);
  addTestItem(library.db, 'Books/Folder Book', 'pagefolder');
  addTestItem(library.db, 'Books/Zip Book.cbz', 'cbz');
  addTestItem(library.db, 'Books/Plain Book.pdf', 'pdf');
  // The thumbnail job would count the pages.
  library.db.prepare('UPDATE items SET page_count = 3 WHERE kind = ?').run('pagefolder');
  library.db.prepare('UPDATE items SET page_count = 2 WHERE kind = ?').run('cbz');
  ids = findItemIdsByPath(library.db, REFERENCE_ROOT_ID);
  app = await buildApp({
    config: {
      host: LOOPBACK_HOST,
      port: PORT,
      appDir: findAppDir(),
      homeDir: findAppDir(),
      version: '0.0.0-test',
    },
    install: { current: { kind: 'ready', dataDir: library.dataDir, referenceDir } },
    token: 'test-token',
    library: testRuntime(),
  });
});

afterAll(async () => {
  await app.close();
  await library.remove();
  await rm(referenceDir, { recursive: true, force: true });
});

/** Fetches a page as this PC's browser would. */
async function get(url: string) {
  return app.inject({ url, headers: { host: HOST } });
}

/** An item's id by its path, as text for a URL. */
function idOf(relPath: string): string {
  return String(ids.get(relPath));
}

describe('R21: the strip shows small page pictures for CBZ files and page folders', () => {
  it('links each strip page to its small picture, versioned by the file time', async () => {
    const body = (await get(`/item/${idOf('Books/Zip Book.cbz')}`)).body;
    const version = `${String(Date.parse('2026-10-01T00:00:00Z'))}-1000`;
    const id = idOf('Books/Zip Book.cbz');
    expect(body).toContain(`src="/media/page-strip/${id}/1?v=${version}"`);
    expect(body).toContain(`src="/media/page-strip/${id}/2?v=${version}"`);
    // The page on show is still the full picture.
    expect(body).toContain(`class="reader-page" src="/media/page/${id}/1"`);
  });

  it('answers a 92×120 WebP for page n of a CBZ and a page folder, kept by the browser', async () => {
    for (const relPath of ['Books/Zip Book.cbz', 'Books/Folder Book']) {
      const response = await get(`/media/page-strip/${idOf(relPath)}/2?v=1`);
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/webp');
      expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      const picture = await sharp(response.rawPayload).metadata();
      expect([picture.format, picture.width, picture.height]).toEqual(['webp', 92, 120]);
      expect(response.rawPayload.length).toBeLessThan(5000);
    }
  });

  it('draws the page asked for, not the cover', async () => {
    const id = idOf('Books/Folder Book');
    const first = await sharp((await get(`/media/page-strip/${id}/1`)).rawPayload).stats();
    const second = await sharp((await get(`/media/page-strip/${id}/2`)).rawPayload).stats();
    expect(first.channels[0]?.mean).toBeLessThan(60);
    expect(second.channels[0]?.mean).toBeGreaterThan(180);
  });

  it('refuses a page that is not there, a PDF and a page that is not a picture', async () => {
    expect((await get(`/media/page-strip/${idOf('Books/Zip Book.cbz')}/3`)).statusCode).toBe(404);
    expect((await get(`/media/page-strip/${idOf('Books/Plain Book.pdf')}/1`)).statusCode).toBe(404);
    expect((await get(`/media/page-strip/${idOf('Books/Folder Book')}/3`)).statusCode).toBe(500);
  });
});
