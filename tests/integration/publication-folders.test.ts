// Making a folder of scans one publication by hand, and turning it back (PRD R6, folders of
// scanned pages; docs/ARCHITECTURE.md, Publications made by hand).
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listFolderPages } from '#core/archive/publication-pages.js';
import { findItemByPath } from '#core/db/repositories/items.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { findSubcategoryBySlug } from '#core/db/repositories/subcategories.js';
import { tagItems } from '#core/db/repositories/tags.js';
import { scanRoot } from '#core/indexer/scanner.js';
import {
  makeFolderPublication,
  unmakeFolderPublication,
} from '#core/organize/publication-folders.js';

import { makeTempLibrary } from '../support/temp-library.ts';

import type { TempLibrary } from '../support/temp-library.ts';

const NOW = new Date('2026-11-11T12:00:00.000Z');
// Scans named the way the page-folder rule can't recognize: a word before each page number.
const SCANS = ['ldq_b 1.jpg', 'ldq_b 2.jpg', 'ldq_b 10.jpg'];
const ISSUE = 'Scans/LDQ No. 12';

let referenceDir: string;
let library: TempLibrary;

/** Scans the whole Reference folder, as a launch would. */
async function scanAll(): Promise<void> {
  await scanRoot({
    db: library.db,
    rootId: REFERENCE_ROOT_ID,
    rootPath: referenceDir,
    now: () => NOW,
  });
}

/** The id of the item at a path, which must exist. */
function idAt(relPath: string): number {
  const item = findItemByPath(library.db, REFERENCE_ROOT_ID, relPath);
  if (item === undefined) {
    throw new Error(`No item at ${relPath}.`);
  }
  return item.id;
}

/** Every item as path, kind and whether it is missing. */
function items(): { rel_path: string; kind: string; missing: number }[] {
  return library.db
    .prepare(
      'SELECT rel_path, kind, missing_since IS NOT NULL AS missing FROM items ORDER BY rel_path',
    )
    .all() as { rel_path: string; kind: string; missing: number }[];
}

/** The Magazines subcategory seeded in every library. */
function magazinesId(): number {
  const magazines = findSubcategoryBySlug(library.db, 'library', 'magazines');
  if (magazines === undefined) {
    throw new Error('Magazines is seeded in every library.');
  }
  return magazines.id;
}

beforeEach(async () => {
  referenceDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-publication-'));
  await mkdir(path.join(referenceDir, ...ISSUE.split('/')), { recursive: true });
  for (const name of SCANS) {
    await writeFile(path.join(referenceDir, ...ISSUE.split('/'), name), `bytes of ${name}`);
  }
  await writeFile(path.join(referenceDir, 'loose.jpg'), 'a photo in the Reference folder itself');
  library = await makeTempLibrary(referenceDir);
  await scanAll();
});

afterEach(async () => {
  await library.remove();
  await rm(referenceDir, { recursive: true, force: true });
});

describe('making a folder of scans one publication', () => {
  it('R6: keeps a video and a PDF in the folder as items of their own', async () => {
    const folder = path.join(referenceDir, ...ISSUE.split('/'));
    await writeFile(path.join(folder, 'pose_session_04_seated.mp4'), 'a video');
    await writeFile(path.join(folder, 'Studies in Hands.pdf'), 'a PDF');
    await scanAll();
    await makeFolderPublication(library.db, {
      selection: { itemIds: [idAt(`${ISSUE}/ldq_b 1.jpg`)] },
      subcategoryId: magazinesId(),
      now: NOW,
    });
    await scanAll();
    expect(items()).toEqual([
      { rel_path: 'loose.jpg', kind: 'image', missing: 0 },
      { rel_path: ISSUE, kind: 'pagefolder', missing: 0 },
      { rel_path: `${ISSUE}/pose_session_04_seated.mp4`, kind: 'video', missing: 0 },
      { rel_path: `${ISSUE}/Studies in Hands.pdf`, kind: 'pdf', missing: 0 },
    ]);
  });

  it('R6: refuses scans from more than one folder, so one action is one publication', async () => {
    const other = path.join(referenceDir, 'Scans', 'LDQ No. 11');
    await mkdir(other, { recursive: true });
    await writeFile(path.join(other, 'ldq_a 1.jpg'), 'another scan');
    await scanAll();
    await expect(
      makeFolderPublication(library.db, {
        selection: {
          itemIds: [idAt(`${ISSUE}/ldq_b 1.jpg`), idAt('Scans/LDQ No. 11/ldq_a 1.jpg')],
        },
        subcategoryId: magazinesId(),
        now: NOW,
      }),
    ).rejects.toThrow('The selected scans are in 2 folders.');
    expect(items().some((row) => row.kind === 'pagefolder')).toBe(false);
  });

  it('R6: turns the folder into one Library item read in page order, filed where Jim chose', async () => {
    expect(items().filter((row) => row.kind === 'image')).toHaveLength(4);
    const result = await makeFolderPublication(library.db, {
      selection: { itemIds: [idAt(`${ISSUE}/ldq_b 2.jpg`)] },
      subcategoryId: magazinesId(),
      now: NOW,
    });
    const publication = findItemByPath(library.db, REFERENCE_ROOT_ID, ISSUE);
    expect(publication).toMatchObject({
      kind: 'pagefolder',
      section: 'library',
      isFiledByHand: true,
    });
    expect(publication?.subcategoryId).toBe(magazinesId());
    expect(result).toEqual({ itemCount: 1, publicationId: publication?.id });
    expect(items()).toEqual([
      { rel_path: 'loose.jpg', kind: 'image', missing: 0 },
      { rel_path: ISSUE, kind: 'pagefolder', missing: 0 },
    ]);
    expect(await listFolderPages(referenceDir, ISSUE)).toEqual([
      'ldq_b 1.jpg',
      'ldq_b 2.jpg',
      'ldq_b 10.jpg',
    ]);
  });

  it('R6: stays a publication through later scans, and keeps scans Jim tagged as missing items', async () => {
    tagItems(library.db, [idAt(`${ISSUE}/ldq_b 10.jpg`)], 'hands');
    await makeFolderPublication(library.db, {
      selection: { itemIds: [idAt(`${ISSUE}/ldq_b 1.jpg`)] },
      subcategoryId: magazinesId(),
      now: NOW,
    });
    await scanAll();
    expect(items()).toEqual([
      { rel_path: 'loose.jpg', kind: 'image', missing: 0 },
      { rel_path: ISSUE, kind: 'pagefolder', missing: 0 },
      { rel_path: `${ISSUE}/ldq_b 10.jpg`, kind: 'image', missing: 1 },
    ]);
  });

  it('R6: turns back into loose photos, and the publication goes', async () => {
    const { publicationId } = await makeFolderPublication(library.db, {
      selection: { itemIds: [idAt(`${ISSUE}/ldq_b 1.jpg`)] },
      subcategoryId: magazinesId(),
      now: NOW,
    });
    const folder = await unmakeFolderPublication(library.db, publicationId, NOW);
    expect(folder).toBe(ISSUE);
    await scanAll();
    expect(items().map((row) => [row.rel_path, row.kind, row.missing])).toEqual([
      ['loose.jpg', 'image', 0],
      [`${ISSUE}/ldq_b 1.jpg`, 'image', 0],
      [`${ISSUE}/ldq_b 10.jpg`, 'image', 0],
      [`${ISSUE}/ldq_b 2.jpg`, 'image', 0],
    ]);
  });

  it('R6: refuses scans directly in the Reference folder, things that aren’t photos, and other sections', async () => {
    await expect(
      makeFolderPublication(library.db, {
        selection: { itemIds: [idAt('loose.jpg')] },
        subcategoryId: magazinesId(),
        now: NOW,
      }),
    ).rejects.toThrow('Move them into a folder of their own first.');
    const figure = library.db
      .prepare(
        "INSERT INTO subcategories (section, name, slug, position, thumb_shape) VALUES ('photos', 'Figure', 'figure', 1, 'square') RETURNING id",
      )
      .get() as { id: number };
    await expect(
      makeFolderPublication(library.db, {
        selection: { itemIds: [idAt(`${ISSUE}/ldq_b 1.jpg`)] },
        subcategoryId: figure.id,
        now: NOW,
      }),
    ).rejects.toThrow('A publication goes in a Library subcategory.');
    await expect(unmakeFolderPublication(library.db, idAt('loose.jpg'), NOW)).rejects.toThrow(
      'Only a folder made into a publication can be turned back.',
    );
  });
});
