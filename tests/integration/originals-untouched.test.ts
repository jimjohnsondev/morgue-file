// R3: metadata lives in library.db, never beside the originals.
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LIBRARY_FILE_NAME } from '#core/db/connection.js';
import { openLibrary } from '#core/db/library.js';
import { addItemsToCollection, insertCollection } from '#core/db/repositories/collections.js';
import { recordItemView } from '#core/db/repositories/item-views.js';
import { fileItemsByHand, insertItem } from '#core/db/repositories/items.js';
import { linkModelToItems, setModelPortrait } from '#core/db/repositories/models.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { insertSubcategory } from '#core/db/repositories/subcategories.js';
import { tagItems } from '#core/db/repositories/tags.js';
import { setFieldValue } from '#core/fields/fields.js';
import { createModel } from '#core/models/models.js';

import { hashTree } from '../../scripts/fixtures/write.ts';

let rootDir: string;
let referenceDir: string;
let dataDir: string;

/** Placeholder originals: invented bytes, not real media. */
const ORIGINALS = ['Figure/figure_0001.jpg', 'Hands/hands_0001.jpg', 'Books/Studies in Hands.pdf'];

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-r3-'));
  referenceDir = path.join(rootDir, 'Reference tést');
  dataDir = path.join(rootDir, 'data');
  await mkdir(dataDir);
  for (const relPath of ORIGINALS) {
    await mkdir(path.join(referenceDir, path.dirname(relPath)), { recursive: true });
    await writeFile(path.join(referenceDir, relPath), `placeholder bytes for ${relPath}`);
  }
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

describe('R3: organizing never modifies originals', () => {
  it('R3: tags, fields, collections, models and filing leave every original’s hash unchanged', async () => {
    const before = await hashTree(referenceDir);
    const db = openLibrary({ dataDir, appVersion: '0.0.0-test', referenceDir });
    const itemIds = ORIGINALS.map((relPath) =>
      insertItem(db, {
        rootId: REFERENCE_ROOT_ID,
        relPath,
        kind: relPath.endsWith('.pdf') ? 'pdf' : 'image',
        size: 1,
        mtimeMs: 0,
        addedAt: '2026-10-31T12:00:00.000Z',
      }),
    );
    tagItems(db, itemIds, 'hands');
    setFieldValue(db, { entity: 'item', entityId: itemIds[0]!, key: 'notes' }, 'Strong light.');
    addItemsToCollection(db, insertCollection(db, 'Spring model session', '2026-10-31'), {
      itemIds,
      addedAt: '2026-10-31',
    });
    const elena = createModel(db, 'Elena Varga');
    linkModelToItems(db, elena, { itemIds });
    setModelPortrait(db, elena, itemIds[0]!);
    fileItemsByHand(db, itemIds.slice(0, 1), insertSubcategory(db, 'photos', 'Figure'));
    recordItemView(db, { itemId: itemIds[2]!, viewedAt: '2026-10-31T12:00:00.000Z', position: 3 });
    db.close();

    expect(await hashTree(referenceDir)).toEqual(before);
    expect(await readdir(dataDir)).toContain(LIBRARY_FILE_NAME);
  });
});
