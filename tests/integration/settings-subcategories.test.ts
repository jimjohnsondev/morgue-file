// R5 and R36 from Settings: subcategories are added, renamed, mapped to folders, unmapped and
// removed in the Subcategories table, items file themselves by those mappings, and the item
// page's [move] files one by hand. Nothing here touches a file on disk (R3).
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findItemById, findItemByPath } from '#core/db/repositories/items.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { findSubcategoryById, findSubcategoryBySlug } from '#core/db/repositories/subcategories.js';

import { startSettingsApp, waitFor } from '../support/settings-app.ts';

import type { Item } from '#core/db/repositories/items.js';
import type { SettingsApp } from '../support/settings-app.ts';

const FILES = [
  'Figure/figure_0001.jpg',
  'Figure/Seated/figure_0002.jpg',
  'Figure/sketchbook.pdf',
  'Hands/hands_0001.jpg',
  'Inbox/download_001.jpg',
];

let settings: SettingsApp;

beforeEach(async () => {
  settings = await startSettingsApp(FILES);
}, 60_000);

afterEach(async () => {
  await settings.remove();
});

/** The item at a path under the Reference folder; the test fails if there is none. */
function itemAt(relPath: string): Item {
  const item = findItemByPath(settings.db, REFERENCE_ROOT_ID, relPath);
  expect(item, relPath).toBeDefined();
  return item!;
}

/** Adds a subcategory from Settings and returns its id. */
async function addSubcategory(fields: Record<string, string>): Promise<number> {
  const response = await settings.send('POST', '/api/subcategories', fields);
  expect(response.statusCode, response.body).toBe(200);
  return response.json<{ id: number }>().id;
}

describe('the Subcategories table in Settings', () => {
  it('R5: a file dropped into a folder mapped in Settings lands in its subcategory with no manual filing', async () => {
    const figure = await addSubcategory({
      section: 'photos',
      name: 'Figure',
      folder: path.join(settings.referenceDir, 'Figure'),
    });
    // Files already there are filed at once, subfolders included.
    expect(itemAt('Figure/figure_0001.jpg').subcategoryId).toBe(figure);
    expect(itemAt('Figure/Seated/figure_0002.jpg').subcategoryId).toBe(figure);

    await settings.writeFileUnder(settings.referenceDir, 'Figure/figure_0003.jpg');
    await waitFor(
      () =>
        findItemByPath(settings.db, REFERENCE_ROOT_ID, 'Figure/figure_0003.jpg')?.subcategoryId ===
        figure,
    );
  });

  it('R4: a mapping files only items of its own section, so every item stays in exactly one', async () => {
    const figure = await addSubcategory({ section: 'photos', name: 'Figure', folder: 'Figure' });
    const sketchbook = itemAt('Figure/sketchbook.pdf');
    expect(sketchbook.section).toBe('library');
    expect(sketchbook.subcategoryId).toBeUndefined();
    expect(findSubcategoryById(settings.db, figure)?.section).toBe('photos');
    // No item anywhere sits in a subcategory of another section.
    const strays = settings.db
      .prepare(
        `SELECT COUNT(*) AS count FROM items JOIN subcategories ON subcategories.id = items.subcategory_id
         WHERE subcategories.section <> items.section`,
      )
      .get() as { count: number };
    expect(strays.count).toBe(0);
  });

  it('R36: a subcategory is renamed, mapped, unmapped and removed from Settings', async () => {
    const hands = await addSubcategory({ section: 'photos', name: 'Hands' });
    expect(itemAt('Hands/hands_0001.jpg').subcategoryId).toBeUndefined();

    const mapped = await settings.send('POST', `/api/subcategories/${String(hands)}/folders`, {
      folder: 'Hands',
    });
    expect(mapped.statusCode).toBe(204);
    expect(itemAt('Hands/hands_0001.jpg').subcategoryId).toBe(hands);

    const renamed = await settings.send('POST', `/api/subcategories/${String(hands)}/name`, {
      name: 'Hand studies',
    });
    expect(renamed.statusCode).toBe(204);
    expect(findSubcategoryBySlug(settings.db, 'photos', 'hand-studies')?.id).toBe(hands);
    const page = await settings.get('/photos/hand-studies');
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('hands_0001.jpg');

    const mappingId = (
      settings.db.prepare('SELECT id FROM folder_mappings WHERE subcategory_id = ?').get(hands) as {
        id: number;
      }
    ).id;
    const unmapped = await settings.send('DELETE', `/api/folder-mappings/${String(mappingId)}`);
    expect(unmapped.statusCode).toBe(204);
    expect(itemAt('Hands/hands_0001.jpg').subcategoryId).toBeUndefined();

    await settings.send('POST', `/api/subcategories/${String(hands)}/folders`, { folder: 'Hands' });
    const removed = await settings.send('DELETE', `/api/subcategories/${String(hands)}`);
    expect(removed.statusCode).toBe(204);
    expect(findSubcategoryById(settings.db, hands)).toBeUndefined();
    expect(itemAt('Hands/hands_0001.jpg').subcategoryId).toBeUndefined();
    const unsorted = await settings.get('/unsorted');
    expect(unsorted.body).toContain('hands_0001.jpg');
  });

  it('R36: Settings refuses a folder outside every watched folder, one already mapped, and removing Magazines', async () => {
    const figure = await addSubcategory({ section: 'photos', name: 'Figure', folder: 'Figure' });
    const outside = await settings.send('POST', `/api/subcategories/${String(figure)}/folders`, {
      folder: path.join(settings.rootDir, 'Elsewhere'),
    });
    expect(outside.statusCode).toBe(400);
    expect(outside.json<{ message: string }>().message).toContain("isn't inside");

    const portrait = await addSubcategory({ section: 'photos', name: 'Portrait' });
    const taken = await settings.send('POST', `/api/subcategories/${String(portrait)}/folders`, {
      folder: 'figure',
    });
    expect(taken.statusCode).toBe(400);
    expect(taken.json<{ message: string }>().message).toContain('mapped to Figure');

    const climbing = await settings.send('POST', `/api/subcategories/${String(portrait)}/folders`, {
      folder: '..\\Elsewhere',
    });
    expect(climbing.statusCode).toBe(400);

    const magazines = findSubcategoryBySlug(settings.db, 'library', 'magazines')!;
    const refused = await settings.send('DELETE', `/api/subcategories/${String(magazines.id)}`);
    expect(refused.statusCode).toBe(400);
    expect(findSubcategoryById(settings.db, magazines.id)).toBeDefined();
  });

  it('R5: an item filed by hand with [move] stays there when folder mappings change', async () => {
    const drapery = await addSubcategory({ section: 'photos', name: 'Drapery' });
    const download = itemAt('Inbox/download_001.jpg');
    const filed = await settings.send('POST', `/api/items/${String(download.id)}/subcategory`, {
      subcategory: String(drapery),
    });
    expect(filed.statusCode).toBe(204);
    expect(findItemById(settings.db, download.id)).toMatchObject({
      subcategoryId: drapery,
      isFiledByHand: true,
    });

    await addSubcategory({ section: 'photos', name: 'Downloads', folder: 'Inbox' });
    expect(findItemById(settings.db, download.id)?.subcategoryId).toBe(drapery);

    const back = await settings.send('POST', `/api/items/${String(download.id)}/subcategory`, {
      subcategory: 'unsorted',
    });
    expect(back.statusCode).toBe(204);
    expect(findItemById(settings.db, download.id)?.subcategoryId).toBeUndefined();

    const books = findSubcategoryBySlug(settings.db, 'library', 'books')!;
    const wrongSection = await settings.send(
      'POST',
      `/api/items/${String(download.id)}/subcategory`,
      { subcategory: String(books.id) },
    );
    expect(wrongSection.statusCode).toBe(400);
  });

  it('R36: the Settings page shows each section’s subcategories with their mapped folders and counts', async () => {
    await addSubcategory({ section: 'photos', name: 'Figure', folder: 'Figure' });
    const page = await settings.get('/settings');
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<h1 class="page__title">Settings</h1>');
    expect(page.body).toContain(path.join(settings.referenceDir, 'Figure'));
    expect(page.body).toContain('none, filed by hand');
    expect(page.body).toContain('Magazines');
    expect(page.body).toContain('Reference folder');
    expect(page.body).toContain(path.join(settings.referenceDir, 'Inbox'));
    expect(page.body).not.toContain('<dialog');
  });

  it('refuses a Settings change without the page’s token', async () => {
    const response = await settings.app.inject({
      method: 'POST',
      url: '/api/subcategories',
      headers: { host: '127.0.0.1:47697', origin: 'http://127.0.0.1:47697' },
      payload: { section: 'photos', name: 'Figure' },
    });
    expect(response.statusCode).toBe(403);
    expect(findSubcategoryBySlug(settings.db, 'photos', 'figure')).toBeUndefined();
  });
});
