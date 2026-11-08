// R35: the viewing history. An Item page says what to record, the API records it, and Home's
// first strip links back into each item at the video time or page its viewer reached.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { findRecentItemViews } from '#core/db/repositories/item-views.js';

import { startOrganizeApp } from '../support/organize-app.js';
import { addTestItem } from '../support/temp-library.js';

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
  app.db.exec('DELETE FROM item_views');
});

/** The items Home's first strip links to, in order; each card links from its picture and name. */
async function pickUpLinks(): Promise<string[]> {
  const html = (await app.get('/')).body;
  const start = html.indexOf('Pick up where you left off');
  const end = html.indexOf('Recently added', start);
  const strip = html.slice(start, end);
  return [...new Set([...strip.matchAll(/href="(\/item\/[^"]+)"/g)].map((match) => match[1]!))];
}

describe('recording a view', () => {
  it('R35: an Item page names the item and the page or video time it opens at', async () => {
    const book = (await app.get(`/item/${String(app.bookId)}`)).body;
    expect(book).toContain(`data-history-item="${String(app.bookId)}"`);
    expect(book).toContain('data-history-position="1"');
    const photo = (await app.get(`/item/${String(app.figureIds[0]!)}`)).body;
    expect(photo).toContain(`data-history-item="${String(app.figureIds[0]!)}"`);
    expect(photo).not.toContain('data-history-position');
    const video = (await app.get(`/item/${String(videoId)}?t=42.12`)).body;
    expect(video).toContain('data-history-position="42.12"');
    expect(video).toContain('data-start="42.12"');
  });

  it('R35: the API records a view with its position, one entry per opening', async () => {
    const url = `/api/items/${String(videoId)}/view`;
    expect((await app.send('POST', url, { position: 0 })).statusCode).toBe(204);
    expect((await app.send('POST', url, { position: 42.12 })).statusCode).toBe(204);
    const views = findRecentItemViews(app.db, 10);
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ itemId: videoId, position: 42.12 });
  });

  it('R35: a view of an item that does not exist, or a bad position, is refused', async () => {
    expect((await app.send('POST', '/api/items/999999/view', {})).statusCode).toBe(404);
    const negative = { position: -1 };
    const url = `/api/items/${String(videoId)}/view`;
    expect((await app.send('POST', url, negative)).statusCode).toBe(400);
    expect(findRecentItemViews(app.db, 10)).toEqual([]);
  });
});

describe('reopening from Home', () => {
  it('R35: Home reopens a video at its time and a Library item at its page', async () => {
    await app.send('POST', `/api/items/${String(app.figureIds[0]!)}/view`, {});
    await app.send('POST', `/api/items/${String(app.bookId)}/view`, { position: 12 });
    await app.send('POST', `/api/items/${String(videoId)}/view`, { position: 42.123456 });
    expect(await pickUpLinks()).toEqual([
      `/item/${String(videoId)}?t=42.12`,
      `/item/${String(app.bookId)}?page=12`,
      `/item/${String(app.figureIds[0]!)}`,
    ]);
    const history = (await app.get('/history')).body;
    expect(history).toContain(`href="/item/${String(videoId)}?t=42.12"`);
  });

  it('R35: the start time belongs to one opening, so other links on the page leave it out', async () => {
    const html = (await app.get(`/item/${String(videoId)}?t=42.12`)).body;
    expect(html.match(/t=42\.12/g)).toBeNull();
  });
});
