import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  addItemsToCollection,
  findCollectionSummaries,
  findItemIdsByCollection,
  insertCollection,
} from '#core/db/repositories/collections.js';
import {
  findRecentItemViews,
  KEPT_VIEWS,
  recordItemView,
} from '#core/db/repositories/item-views.js';
import {
  fileItemsByHand,
  findItemById,
  findItemByPath,
  refileItemsByMappings,
} from '#core/db/repositories/items.js';
import {
  findItemIdsByModel,
  findModelBySlug,
  findModelTagNames,
  linkModelToItems,
  setModelPortrait,
  tagModel,
} from '#core/db/repositories/models.js';
import { REFERENCE_ROOT_ID, findRootById, setRootStatus } from '#core/db/repositories/roots.js';
import { readSetting, writeSetting } from '#core/db/repositories/settings.js';
import {
  findSubcategoriesBySection,
  findSubcategoryBySlug,
  insertFolderMapping,
  insertSubcategory,
} from '#core/db/repositories/subcategories.js';
import { findTagNamesByItem, tagItems } from '#core/db/repositories/tags.js';
import { createModel } from '#core/models/models.js';

import { addTestItem, makeTempLibrary } from '../support/temp-library.js';

import type { Db } from '#core/db/connection.js';
import type { TempLibrary } from '../support/temp-library.js';

let library: TempLibrary;
let db: Db;

beforeEach(async () => {
  library = await makeTempLibrary();
  db = library.db;
});

afterEach(async () => {
  await library.remove();
});

/** Maps a folder of root 1 to a new photos subcategory and returns the subcategory's id. */
function mapFolder(relPrefix: string, name: string): number {
  const subcategoryId = insertSubcategory(db, 'photos', name);
  insertFolderMapping(db, { rootId: REFERENCE_ROOT_ID, relPrefix, subcategoryId });
  return subcategoryId;
}

describe('items', () => {
  it('stores an item under its root with its section from its kind', () => {
    const id = addTestItem(db, 'Video/Poses/pose_session_04_seated.mp4', 'video');
    expect(findItemById(db, id)).toMatchObject({
      rootId: REFERENCE_ROOT_ID,
      relPath: 'Video/Poses/pose_session_04_seated.mp4',
      kind: 'video',
      section: 'video',
      subcategoryId: undefined,
      isFiledByHand: false,
      thumbState: 'pending',
      missingSince: undefined,
    });
  });

  it('finds a path ignoring case, and refuses a second row for the same file', () => {
    const id = addTestItem(db, 'Figure/Seated_Backlit_017.jpg');
    expect(findItemByPath(db, REFERENCE_ROOT_ID, 'figure/seated_backlit_017.JPG')?.id).toBe(id);
    expect(() => addTestItem(db, 'FIGURE/seated_backlit_017.jpg')).toThrow(/UNIQUE/);
  });

  it('files a new item by the longest folder mapping that holds it, on whole folder names', () => {
    const video = insertSubcategory(db, 'video', 'Video');
    insertFolderMapping(db, {
      rootId: REFERENCE_ROOT_ID,
      relPrefix: 'Video',
      subcategoryId: video,
    });
    const poses = insertSubcategory(db, 'video', 'Poses');
    insertFolderMapping(db, {
      rootId: REFERENCE_ROOT_ID,
      relPrefix: 'Video/Poses',
      subcategoryId: poses,
    });
    const figure = mapFolder('Figure', 'Figure');

    const inPoses = addTestItem(db, 'Video/Poses/Long/pose_01.mp4', 'video');
    const inVideo = addTestItem(db, 'Video/clip.mp4', 'video');
    const inFigure = addTestItem(db, 'figure/figure_0001.jpg');
    const inFigures = addTestItem(db, 'Figures/figure_0002.jpg');
    expect(findItemById(db, inPoses)?.subcategoryId).toBe(poses);
    expect(findItemById(db, inVideo)?.subcategoryId).toBe(video);
    expect(findItemById(db, inFigure)?.subcategoryId).toBe(figure);
    expect(findItemById(db, inFigures)?.subcategoryId).toBeUndefined();
  });

  it('refiles items when a mapping is added, but leaves items filed by hand alone', () => {
    const byHand = addTestItem(db, 'Misc/drapery_0001.png');
    const unsorted = addTestItem(db, 'Misc/drapery_0002.png');
    const drapery = insertSubcategory(db, 'photos', 'Drapery');
    fileItemsByHand(db, [byHand], drapery);

    const misc = mapFolder('Misc', 'Misc');
    refileItemsByMappings(db, REFERENCE_ROOT_ID);
    expect(findItemById(db, byHand)).toMatchObject({ subcategoryId: drapery, isFiledByHand: true });
    expect(findItemById(db, unsorted)).toMatchObject({ subcategoryId: misc, isFiledByHand: false });
  });
});

describe('subcategories', () => {
  it('lists a section’s subcategories in order, with Library ones shown as covers', () => {
    insertSubcategory(db, 'library', 'Sketchbooks');
    expect(
      findSubcategoriesBySection(db, 'library').map((entry) => [entry.slug, entry.thumbShape]),
    ).toEqual([
      ['books', 'cover'],
      ['magazines', 'cover'],
      ['sketchbooks', 'cover'],
    ]);
    insertSubcategory(db, 'photos', 'Life Drawing');
    expect(findSubcategoryBySlug(db, 'photos', 'life-drawing')).toMatchObject({
      name: 'Life Drawing',
      thumbShape: 'square',
      position: 1,
    });
  });
});

describe('names in any script', () => {
  it('slugs accented and non-Latin names, and refuses names with no letters', () => {
    insertSubcategory(db, 'library', 'Études');
    insertSubcategory(db, 'photos', '人物画');
    expect(findSubcategoryBySlug(db, 'library', 'etudes')?.name).toBe('Études');
    expect(findSubcategoryBySlug(db, 'photos', '人物画')?.name).toBe('人物画');
    expect(() => insertSubcategory(db, 'photos', '!!!')).toThrow(/letter or digit/);
    expect(() => insertSubcategory(db, 'library', 'etudes')).toThrow(/already a subcategory/);
    createModel(db, 'Modèle Deux');
    expect(findModelBySlug(db, 'modele-deux')).toBeDefined();
    createModel(db, 'ガ');
    expect(findModelBySlug(db, 'ガ')).toBeDefined();
    createModel(db, 'चित्र');
    expect(findModelBySlug(db, 'चित्र')).toBeDefined();
  });

  it('refuses empty tag names', () => {
    const item = addTestItem(db, 'a.jpg');
    expect(() => {
      tagItems(db, [item], '  ');
    }).toThrow(/needs a name/);
    expect(() => {
      tagModel(db, createModel(db, 'Elena Varga'), '');
    }).toThrow(/needs a name/);
  });
});

describe('roots', () => {
  it('records a root going offline', () => {
    setRootStatus(db, REFERENCE_ROOT_ID, 'offline');
    expect(findRootById(db, REFERENCE_ROOT_ID)?.status).toBe('offline');
  });
});

describe('tags and collections', () => {
  it('tags 200 items in one call, with names matched ignoring case', () => {
    const ids = Array.from({ length: 200 }, (_, index) =>
      addTestItem(db, `Hands/h_${String(index)}.jpg`),
    );
    tagItems(db, ids, 'Hands');
    tagItems(db, ids.slice(0, 1), 'hands');
    tagItems(db, ids.slice(0, 1), 'foreshortened');
    expect(findTagNamesByItem(db, ids[0]!)).toEqual(['foreshortened', 'Hands']);
    expect(findTagNamesByItem(db, ids[199]!)).toEqual(['Hands']);
  });

  it('keeps collection order, and an item can sit in many collections', () => {
    const [first, second, third] = ['a.jpg', 'b.jpg', 'c.jpg'].map((name) => addTestItem(db, name));
    const spring = insertCollection(db, 'Spring model session', '2026-10-31T12:00:00.000Z');
    const hands = insertCollection(db, 'Hands foreshortened', '2026-10-31T12:00:00.000Z');
    addItemsToCollection(db, spring, { itemIds: [third!, first!], addedAt: '2026-10-31' });
    addItemsToCollection(db, spring, { itemIds: [second!, first!], addedAt: '2026-10-31' });
    addItemsToCollection(db, hands, { itemIds: [first!], addedAt: '2026-10-31' });
    expect(findItemIdsByCollection(db, spring)).toEqual([third, first, second]);
    expect(findCollectionSummaries(db)).toEqual([
      { id: spring, name: 'Spring model session', itemCount: 3 },
      { id: hands, name: 'Hands foreshortened', itemCount: 1 },
    ]);
  });
});

describe('models', () => {
  it('gives two models with one name distinct slugs', () => {
    createModel(db, 'Elena Varga');
    const second = createModel(db, 'Elena Varga');
    expect(findModelBySlug(db, 'elena-varga-2')?.id).toBe(second);
  });

  it('R14: a model links to items whole or by page range, has tags, and any photo can be its portrait', () => {
    const elena = createModel(db, 'Elena Varga');
    const photo = addTestItem(db, 'Portrait/portrait_elena_109.jpg');
    const magazine = addTestItem(db, 'Magazines/LDQ No. 12.pdf', 'pdf');
    linkModelToItems(db, elena, { itemIds: [photo] });
    linkModelToItems(db, elena, { itemIds: [photo] });
    linkModelToItems(db, elena, { itemIds: [magazine], pages: [12, 19] });
    linkModelToItems(db, elena, { itemIds: [magazine], pages: [30, 33] });
    expect(() => {
      linkModelToItems(db, elena, { itemIds: [magazine], pages: [19, 12] });
    }).toThrow(/CHECK/);
    setModelPortrait(db, elena, photo);
    tagModel(db, elena, 'long poses');
    tagModel(db, elena, 'dancer');

    expect(findItemIdsByModel(db, elena)).toEqual([photo, magazine]);
    expect(db.prepare('SELECT count(*) AS links FROM item_models').get()).toEqual({ links: 3 });
    expect(findModelBySlug(db, 'elena-varga')?.portraitItemId).toBe(photo);
    expect(findModelTagNames(db, elena)).toEqual(['dancer', 'long poses']);
  });
});

describe('viewing history and settings', () => {
  it('keeps only the newest 200 views', () => {
    const item = addTestItem(db, 'Figure/figure_0193.jpg');
    for (let minute = 0; minute < KEPT_VIEWS + 5; minute++) {
      const viewedAt = new Date(Date.UTC(2026, 9, 31, 0, minute)).toISOString();
      recordItemView(db, { itemId: item, viewedAt, position: minute });
    }
    const views = findRecentItemViews(db, 1000);
    expect(views).toHaveLength(KEPT_VIEWS);
    expect(views[0]?.position).toBe(KEPT_VIEWS + 4);
    expect(views.at(-1)?.position).toBe(5);
  });

  it('stores and replaces a setting', () => {
    expect(readSetting(db, 'thumbs.size')).toBeUndefined();
    writeSetting(db, 'thumbs.size', '"medium"');
    writeSetting(db, 'thumbs.size', '"large"');
    expect(readSetting(db, 'thumbs.size')).toBe('"large"');
  });
});
