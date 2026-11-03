// Applies fixtures/seed.json to the fixture archive's items and checks the counts the design
// brief's Sample content table gives. The scanner arrives in PR 6, so the items are added here
// from the fixture plan.
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { findCollectionSummaries } from '#core/db/repositories/collections.js';
import { findRecentItemViews } from '#core/db/repositories/item-views.js';
import { findItemByPath, findItemIdsByPath, insertItem } from '#core/db/repositories/items.js';
import {
  findItemIdsByModel,
  findModelBySlug,
  findModelTagNames,
} from '#core/db/repositories/models.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { findTagNamesByItem } from '#core/db/repositories/tags.js';
import { readFieldValues } from '#core/fields/fields.js';

import { applySeed } from '../../scripts/fixtures/apply-seed.ts';
import { planFixtures } from '../../scripts/fixtures/plan.ts';
import { loadSeed } from '../../scripts/fixtures/seed.ts';
import { makeTempLibrary } from '../support/temp-library.js';

import type { Db } from '#core/db/connection.js';
import type { TempLibrary } from '../support/temp-library.js';

let library: TempLibrary;
let db: Db;

beforeAll(async () => {
  library = await makeTempLibrary();
  db = library.db;
  // One transaction, as the scanner writes in batches: 4,572 separate commits are slow on Windows.
  db.transaction(() => {
    for (const file of planFixtures()) {
      insertItem(db, {
        rootId: REFERENCE_ROOT_ID,
        relPath: file.relPath,
        kind: file.kind,
        size: 1000,
        mtimeMs: file.mtimeMs,
        addedAt: '2026-10-31T12:00:00.000Z',
      });
    }
  })();
  const seed = await loadSeed(path.resolve(import.meta.dirname, '../../fixtures/seed.json'));
  applySeed(db, seed, { rootId: REFERENCE_ROOT_ID, now: '2026-10-31T12:00:00.000Z' });
});

afterAll(async () => {
  await library.remove();
});

/** How many items each subcategory holds, by name, with Unsorted as its own entry. */
function countsBySubcategory(): Record<string, number> {
  const rows = db
    .prepare(
      `SELECT coalesce(subcategories.name, 'Unsorted') AS name, count(*) AS count FROM items
       LEFT JOIN subcategories ON subcategories.id = items.subcategory_id
       GROUP BY items.subcategory_id`,
    )
    .all() as { name: string; count: number }[];
  return Object.fromEntries(rows.map((row) => [row.name, row.count]));
}

function itemId(relPath: string): number {
  return findItemByPath(db, REFERENCE_ROOT_ID, relPath)!.id;
}

describe('seeding the fixture library', () => {
  it('files items into the brief’s subcategories, with 54 Unsorted', () => {
    expect(countsBySubcategory()).toEqual({
      Figure: 1236,
      Portrait: 1488,
      Hands: 902,
      Drapery: 632,
      Poses: 140,
      Timelapses: 46,
      Books: 51,
      Magazines: 23,
      Unsorted: 54,
    });
  });

  it('makes Elena Varga with her fields, tags, portrait and 216 items', () => {
    const elena = findModelBySlug(db, 'elena-varga')!;
    const fields = readFieldValues(db, { entity: 'model', entityId: elena.id });
    expect(Object.fromEntries(fields.map((entry) => [entry.field.label, entry.value]))).toEqual({
      Name: 'Elena Varga',
      Bio: 'Dancer and life model. Best in long seated poses and strong back-lit setups.',
      'Agency link': 'https://example.com/elena-varga',
      'First session': '2024-03-14',
      Sessions: 6,
      'Pose length': 'Long',
    });
    expect(findModelTagNames(db, elena.id)).toEqual(['dancer', 'long poses']);
    expect(elena.portraitItemId).toBe(itemId('Portrait/portrait_elena_109.jpg'));
    expect(findItemIdsByModel(db, elena.id)).toHaveLength(212 + 4);
  });

  it('tags and rates frame 5’s photo', () => {
    const photo = itemId('Figure/seated_backlit_017.jpg');
    expect(findTagNamesByItem(db, photo)).toEqual(['back-lit', 'hands', 'seated']);
    const values = readFieldValues(db, { entity: 'item', entityId: photo });
    expect(values.find((entry) => entry.field.key === 'rating')?.value).toBe(4);
  });

  it('gives every magazine issue its title', () => {
    const magazines = [...findItemIdsByPath(db, REFERENCE_ROOT_ID).keys()].filter((itemPath) =>
      itemPath.startsWith('Magazines/'),
    );
    for (const issuePath of magazines) {
      const item = findItemByPath(db, REFERENCE_ROOT_ID, issuePath)!;
      const values = readFieldValues(db, {
        entity: 'item',
        entityId: item.id,
        subcategoryId: item.subcategoryId!,
      });
      expect(issuePath).toContain(
        String(values.find((entry) => entry.field.key === 'magazine_title')?.value),
      );
    }
  });

  it('makes 38 collections and the four recent views', () => {
    const collections = findCollectionSummaries(db);
    expect(collections).toHaveLength(38);
    expect(collections.every((collection) => collection.itemCount > 0)).toBe(true);
    expect(findRecentItemViews(db, 10)).toHaveLength(4);
  });
});
