// The pages and routes for making a folder of scans one publication (PRD R6): the action
// panel's Make a publication, the two API routes, and Turn back into photos on its details panel.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { findItemByPath } from '#core/db/repositories/items.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { findSubcategoryBySlug } from '#core/db/repositories/subcategories.js';
import { scanFolder } from '#core/indexer/scanner.js';

import { startOrganizeApp } from '../support/organize-app.js';

import type { OrganizeApp } from '../support/organize-app.js';

const ISSUE = 'Scans/LDQ No. 12';

let organize: OrganizeApp;
let scanIds: number[];
let magazines: string;

beforeAll(async () => {
  organize = await startOrganizeApp();
  const folder = path.join(organize.referenceDir, ...ISSUE.split('/'));
  await mkdir(folder, { recursive: true });
  for (const name of ['ldq_b 1.jpg', 'ldq_b 2.jpg']) {
    await writeFile(path.join(folder, name), `bytes of ${name}`);
  }
  await scanFolder(
    { db: organize.db, rootId: REFERENCE_ROOT_ID, rootPath: organize.referenceDir },
    { relDir: ISSUE, isShallow: true },
  );
  scanIds = ['ldq_b 1.jpg', 'ldq_b 2.jpg'].map(
    (name) => findItemByPath(organize.db, REFERENCE_ROOT_ID, `${ISSUE}/${name}`)!.id,
  );
  magazines = String(findSubcategoryBySlug(organize.db, 'library', 'magazines')!.id);
});

afterAll(async () => {
  await organize.remove();
});

describe('R6: Make a publication in the action panel', () => {
  it('R6: is offered on a list of photos, with the Library subcategories to choose from', async () => {
    const body = (await organize.get('/photos/figure?select=on')).body;
    expect(body).toContain('Make a publication');
    expect(body).toContain('data-bulk-action="/api/selection/publication"');
    expect(body).toMatch(/<select id="selection-publication"[^>]*>.*Magazines.*<\/select>/);
  });

  it('R6: is not offered on a list of Library items', async () => {
    const body = (await organize.get('/library?select=on')).body;
    expect(body).toContain('aria-label="Edit selected items"');
    expect(body).not.toContain('Make a publication');
  });
});

describe('R6: the publication routes', () => {
  it('R6: refuse a request without the launch token, and a malformed body', async () => {
    const payload = { selection: { itemIds: scanIds }, subcategory: magazines };
    const tokenless = await organize.inject({
      method: 'POST',
      url: '/api/selection/publication',
      headers: { host: '127.0.0.1:47613', origin: 'http://127.0.0.1:47613' },
      payload,
    });
    expect(tokenless.statusCode).toBe(403);
    const malformed = await organize.send('POST', '/api/selection/publication', {
      selection: { itemIds: scanIds },
      subcategory: 'Magazines',
    });
    expect(malformed.statusCode).toBe(400);
    const notPhotos = await organize.send('POST', '/api/selection/publication', {
      selection: { itemIds: [organize.bookId] },
      subcategory: magazines,
    });
    expect(notPhotos.statusCode).toBe(400);
    expect(findItemByPath(organize.db, REFERENCE_ROOT_ID, ISSUE)).toBeUndefined();
  });

  it('R6: make the folder one publication, which offers to turn back, and turn it back', async () => {
    const made = await organize.send('POST', '/api/selection/publication', {
      selection: { itemIds: [scanIds[0]] },
      subcategory: magazines,
    });
    expect(made.statusCode).toBe(200);
    const { publicationId } = made.json<{ publicationId: number }>();
    const page = (await organize.get(`/item/${String(publicationId)}`)).body;
    expect(page).toContain(`data-api-form="/api/items/${String(publicationId)}/publication/undo"`);
    expect(page).toContain('Turn back into photos');
    expect((await organize.get(`/item/${String(organize.bookId)}`)).body).not.toContain(
      'Turn back into photos',
    );

    const undone = await organize.send(
      'POST',
      `/api/items/${String(publicationId)}/publication/undo`,
    );
    expect(undone.statusCode).toBe(200);
    expect(undone.json()).toEqual({ folder: ISSUE });
    expect(findItemByPath(organize.db, REFERENCE_ROOT_ID, ISSUE)).toBeUndefined();
    expect(findItemByPath(organize.db, REFERENCE_ROOT_ID, `${ISSUE}/ldq_b 1.jpg`)?.kind).toBe(
      'image',
    );
  });
});
