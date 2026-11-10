// R22: the compare board. An Item page offers "add to compare board"; the board holds up to 4
// references in its own window, lays them out side by side or in a grid, and keeps them, their
// layout and its window's place in the library, so all of it comes back after a restart.
import { rm } from 'node:fs/promises';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  addToCompareBoard,
  saveCompareWindow,
  setCompareLayout,
} from '#core/compare/compare-board.js';
import { openLibrary } from '#core/db/library.js';
import { buildApp } from '#server/app.js';
import { findAppDir, LOOPBACK_HOST } from '#server/config.js';

import { runtimeFor, startOrganizeApp } from '../support/organize-app.js';
import { addTestItem, makeTempLibrary } from '../support/temp-library.js';

import type { Db } from '#core/db/connection.js';
import type { OrganizeApp } from '../support/organize-app.js';

let app: OrganizeApp;
let videoId: number;

beforeAll(async () => {
  app = await startOrganizeApp();
  videoId = addTestItem(app.db, 'Video/Poses/pose_session_04_seated.mp4', 'video');
});

afterAll(async () => {
  await app.remove();
});

beforeEach(() => {
  app.db.exec("DELETE FROM settings WHERE key = 'compare-board'");
});

/** Puts items on the board through the API, as an Item page's button does. */
async function addToBoard(...itemIds: number[]): Promise<number[]> {
  const statuses: number[] = [];
  for (const itemId of itemIds) {
    statuses.push((await app.send('POST', '/api/compare/items', { itemId })).statusCode);
  }
  return statuses;
}

/** The item ids on the compare board's page, in the order it shows them. */
function boardItemIds(html: string): number[] {
  return [...html.matchAll(/data-compare-item="(\d+)"/g)].map((match) => Number(match[1]));
}

describe('putting references on the board', () => {
  it('R22: every Item page offers to add its item to the compare board', async () => {
    const photo = (await app.get(`/item/${String(app.figureIds[0]!)}`)).body;
    expect(photo).toContain(`data-compare-add="${String(app.figureIds[0]!)}"`);
    expect(photo).toContain('add to compare board');
    const book = (await app.get(`/item/${String(app.bookId)}`)).body;
    expect(book).toContain(`data-compare-add="${String(app.bookId)}"`);
  });

  it('R22: the board holds up to 4 references, in the order they were added', async () => {
    const [first, second, third] = app.figureIds;
    expect(await addToBoard(first!, videoId, second!, app.bookId)).toEqual([204, 204, 204, 204]);
    const full = await app.send('POST', '/api/compare/items', { itemId: third! });
    expect(full.statusCode).toBe(409);
    expect(full.json<{ message: string }>().message).toContain('holds 4 references');
    const html = (await app.get('/compare')).body;
    expect(boardItemIds(html)).toEqual([first!, videoId, second!, app.bookId]);
    expect(html).toContain('Compare board · 4 of 4 references');
  });

  it('R22: adding a reference already on the board keeps it in its place', async () => {
    const [first, second] = app.figureIds;
    expect(await addToBoard(first!, second!, first!)).toEqual([204, 204, 204]);
    expect(boardItemIds((await app.get('/compare')).body)).toEqual([first!, second!]);
  });

  it('R22: an item that does not exist is refused, and the board is unchanged', async () => {
    const missing = await app.send('POST', '/api/compare/items', { itemId: 999_999 });
    expect(missing.statusCode).toBe(404);
    const html = (await app.get('/compare')).body;
    expect(boardItemIds(html)).toEqual([]);
    expect(html).toContain('Nothing on the compare board.');
  });

  it('R22: removing a reference keeps the others in order', async () => {
    const [first, second, third] = app.figureIds;
    await addToBoard(first!, second!, third!);
    const removed = await app.send('DELETE', `/api/compare/items/${String(second!)}`);
    expect(removed.statusCode).toBe(204);
    expect(boardItemIds((await app.get('/compare')).body)).toEqual([first!, third!]);
  });
});

describe('the board page', () => {
  it('R22: each reference shows at full size: photo, video, and a Library cover', async () => {
    await addToBoard(app.figureIds[0]!, videoId, app.bookId);
    const html = (await app.get('/compare')).body;
    expect(html).toContain(`src="/media/original/${String(app.figureIds[0]!)}"`);
    expect(html).toMatch(new RegExp(`<video[^>]+src="/media/original/${String(videoId)}"`));
    expect(html).toContain(`src="/media/thumb/${String(app.bookId)}/320x464?v=`);
    expect(html).toContain('pose_session_04_seated.mp4');
  });

  it('R22: a reference whose original is offline or missing shows its thumbnail and why', async () => {
    const [first, second] = app.figureIds;
    await addToBoard(first!, second!);
    app.db
      .prepare("UPDATE items SET missing_since = '2026-10-31T12:00:00.000Z' WHERE id = ?")
      .run(second!);
    try {
      const missing = (await app.get('/compare')).body;
      expect(missing).toContain(`src="/media/thumb/${String(second!)}/320?v=`);
      expect(missing).toContain('original missing');
      app.db.exec("UPDATE roots SET status = 'offline'");
      const offline = (await app.get('/compare')).body;
      expect(offline).toContain(`src="/media/thumb/${String(first!)}/320?v=`);
      expect(offline).toContain('original offline');
    } finally {
      app.db.prepare('UPDATE items SET missing_since = NULL WHERE id = ?').run(second!);
      app.db.exec("UPDATE roots SET status = 'online'");
    }
  });

  it('R22: the board has its own window, without the banner, tabs or footer', async () => {
    const html = (await app.get('/compare')).body;
    expect(html).toContain('<title>Compare board · Morgue File</title>');
    expect(html).toContain('<meta name="morgue-token"');
    expect(html).not.toContain('class="banner"');
    expect(html).not.toContain('class="tab-bar"');
    expect(html).not.toContain('class="footer"');
  });

  it('R22: the layout switches between side by side and a 2 × 2 grid', async () => {
    await addToBoard(app.figureIds[0]!, app.figureIds[1]!);
    expect((await app.get('/compare')).body).toContain('compare-board__slots--row');
    const changed = await app.send('POST', '/api/compare/layout', { layout: 'grid' });
    expect(changed.statusCode).toBe(204);
    expect((await app.get('/compare')).body).toContain('compare-board__slots--grid');
    const refused = await app.send('POST', '/api/compare/layout', { layout: 'stack' });
    expect(refused.statusCode).toBe(400);
  });

  it('R22: the window’s place is saved, and a size too small or not whole is refused', async () => {
    const place = { left: 40, top: 60, width: 1600, height: 1000 };
    expect((await app.send('POST', '/api/compare/window', place)).statusCode).toBe(204);
    expect((await app.get('/compare')).body).toContain('data-compare-window="40,60,1600,1000"');
    const tiny = { ...place, width: 20 };
    expect((await app.send('POST', '/api/compare/window', tiny)).statusCode).toBe(400);
    const fractional = { ...place, height: 999.5 };
    expect((await app.send('POST', '/api/compare/window', fractional)).statusCode).toBe(400);
  });

  it('R22: a board stored in a shape the app no longer reads opens empty', async () => {
    app.db.prepare("INSERT INTO settings (key, value) VALUES ('compare-board', ?)").run('[1, 2');
    const html = (await app.get('/compare')).body;
    expect(html).toContain('Nothing on the compare board.');
    expect(await addToBoard(app.figureIds[0]!)).toEqual([204]);
  });
});

describe('after a restart', () => {
  /** The board's page from an app built over a library, as the server builds it at launch. */
  async function boardPage(library: { db: Db; dataDir: string }): Promise<string> {
    const server = await buildApp({
      config: {
        host: LOOPBACK_HOST,
        port: 47613,
        appDir: findAppDir(),
        homeDir: findAppDir(),
        version: '0.0.0-test',
      },
      install: {
        current: { kind: 'ready', dataDir: library.dataDir, referenceDir: 'C:\\Reference' },
      },
      token: 'restart-test-token',
      library: runtimeFor(library),
    });
    const response = await server.inject({ url: '/compare', headers: { host: '127.0.0.1:47613' } });
    await server.close();
    return response.body;
  }

  it('R22: the layout survives a restart', async () => {
    const before = await makeTempLibrary();
    const ids = ['a.jpg', 'b.jpg', 'c.jpg'].map((name) => addTestItem(before.db, `Figure/${name}`));
    for (const id of ids) {
      addToCompareBoard(before.db, id);
    }
    setCompareLayout(before.db, 'grid');
    saveCompareWindow(before.db, { left: -1200, top: 80, width: 1400, height: 900 });
    const firstLaunch = await boardPage(before);
    before.db.close();

    const db = openLibrary({
      dataDir: before.dataDir,
      appVersion: '0.0.0-test',
      referenceDir: 'C:\\Reference',
    });
    try {
      const afterRestart = await boardPage({ db, dataDir: before.dataDir });
      expect(boardItemIds(afterRestart)).toEqual(ids);
      expect(afterRestart).toContain('compare-board__slots--grid');
      expect(afterRestart).toContain('data-compare-window="-1200,80,1400,900"');
      expect(afterRestart).toBe(firstLaunch);
    } finally {
      db.close();
      await rm(before.dataDir, { recursive: true, force: true });
    }
  });
});
