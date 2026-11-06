// R1 and R36 from Settings: a folder added in the Watched folders table is indexed and watched
// like the Reference folder, a folder's new location is one edit that keeps every item, and a
// rescan runs on request. Folders that overlap the app or another watched folder are refused.
import { cp, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findItemByPath } from '#core/db/repositories/items.js';
import { findAllRoots, findRootById, REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { tagItems } from '#core/db/repositories/tags.js';

import { startSettingsApp, waitFor } from '../support/settings-app.ts';

import type { SettingsApp } from '../support/settings-app.ts';

let settings: SettingsApp;

beforeEach(async () => {
  settings = await startSettingsApp(['Figure/figure_0001.jpg', 'Inbox/download_001.jpg']);
}, 60_000);

afterEach(async () => {
  await settings.remove();
});

/** Adds a watched folder from Settings and returns the response. */
async function addFolder(folder: string) {
  return settings.send('POST', '/api/roots', { folder });
}

describe('the Watched folders table in Settings', () => {
  it('R1: a folder added in Settings is indexed, and a file added to it later appears within 5 s', async () => {
    const phone = path.join(settings.rootDir, 'Phone exports');
    await settings.writeFileUnder(phone, 'IMG_0001.jpg');
    const added = await addFolder(phone);
    expect(added.statusCode, added.body).toBe(200);
    const rootId = added.json<{ id: number }>().id;
    expect(rootId).not.toBe(REFERENCE_ROOT_ID);

    await settings.library.whenIndexed();
    expect(findItemByPath(settings.db, rootId, 'IMG_0001.jpg')?.section).toBe('photos');

    await settings.writeFileUnder(phone, 'Trip/IMG_0002.jpg');
    await waitFor(() => findItemByPath(settings.db, rootId, 'Trip/IMG_0002.jpg') !== undefined);

    const page = await settings.get('/settings');
    expect(page.body).toContain(phone);
    expect(page.body).toContain('Watched folder');
  });

  it('R36: a subcategory can map a folder inside an added watched folder', async () => {
    const phone = path.join(settings.rootDir, 'Phone exports');
    await settings.writeFileUnder(phone, 'Hands/IMG_0003.jpg');
    const rootId = (await addFolder(phone)).json<{ id: number }>().id;
    await settings.library.whenIndexed();
    const added = await settings.send('POST', '/api/subcategories', {
      section: 'photos',
      name: 'Hands',
      folder: path.join(phone, 'Hands'),
    });
    const hands = added.json<{ id: number }>().id;
    expect(findItemByPath(settings.db, rootId, 'Hands/IMG_0003.jpg')?.subcategoryId).toBe(hands);
  });

  it('R36: the Reference folder’s new location is one edit; items keep their tags and it is saved for the next launch', async () => {
    const before = findItemByPath(settings.db, REFERENCE_ROOT_ID, 'Figure/figure_0001.jpg')!;
    tagItems(settings.db, [before.id], 'seated');
    const moved = path.join(settings.rootDir, 'New drive', 'Reference');
    await mkdir(path.dirname(moved), { recursive: true });
    await cp(settings.referenceDir, moved, { recursive: true, preserveTimestamps: true });

    const response = await settings.send(
      'POST',
      `/api/roots/${String(REFERENCE_ROOT_ID)}/location`,
      {
        folder: moved,
      },
    );
    expect(response.statusCode, response.body).toBe(204);
    await settings.library.whenIndexed();

    expect(findRootById(settings.db, REFERENCE_ROOT_ID)).toMatchObject({
      path: moved,
      status: 'online',
    });
    const after = findItemByPath(settings.db, REFERENCE_ROOT_ID, 'Figure/figure_0001.jpg');
    expect(after).toMatchObject({ id: before.id, missingSince: undefined });
    const saved = JSON.parse(
      await readFile(path.join(settings.dataDir, 'settings.json'), 'utf8'),
    ) as { referenceDirAbsolute: string };
    expect(saved.referenceDirAbsolute).toBe(moved);
    expect(settings.install.current).toMatchObject({ referenceDir: moved });
  });

  it('R1: rescan from Settings picks up a file the watcher was not told about', async () => {
    const response = await settings.send('POST', `/api/roots/${String(REFERENCE_ROOT_ID)}/rescan`);
    expect(response.statusCode).toBe(204);
    await settings.library.whenIndexed();
    expect(findRootById(settings.db, REFERENCE_ROOT_ID)?.status).toBe('online');
    const missing = await settings.send('POST', '/api/roots/99/rescan');
    expect(missing.statusCode).toBe(404);
  });

  it('R36: Settings refuses a folder that overlaps a watched folder or the app, or is not there', async () => {
    const inside = await addFolder(path.join(settings.referenceDir, 'Figure'));
    expect(inside.statusCode).toBe(400);
    expect(inside.json()).toMatchObject({ error: 'folder-overlap' });

    const holding = await addFolder(settings.rootDir);
    expect(holding.statusCode).toBe(400);
    expect(holding.json()).toMatchObject({ error: 'folder-overlap' });

    const gone = await addFolder(path.join(settings.rootDir, 'Not there'));
    expect(gone.statusCode).toBe(400);

    const relative = await addFolder('Phone exports');
    expect(relative.statusCode).toBe(400);
    expect(findAllRoots(settings.db)).toHaveLength(1);
  });
});
