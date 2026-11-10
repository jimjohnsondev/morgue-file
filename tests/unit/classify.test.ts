import { describe, expect, it } from 'vitest';

import { classifyFile } from '#core/archive/classify.js';
import { isPageFolder, sortPageNames } from '#core/archive/pagefolder.js';
import { SECTION_BY_KIND } from '#core/db/repositories/items.js';

import { planFixtures } from '../../scripts/fixtures/plan.ts';

describe('classifying files', () => {
  it('R6: every P0 format is recognized, whatever the case of its extension', () => {
    const names = [
      'a.jpg',
      'b.JPEG',
      'c.png',
      'd.webp',
      'e.gif',
      'f.mp4',
      'g.MOV',
      'h.pdf',
      'i.cbz',
    ];
    expect(names.map((name) => classifyFile(name))).toEqual([
      'image',
      'image',
      'image',
      'image',
      'image',
      'video',
      'video',
      'pdf',
      'cbz',
    ]);
  });

  it('R7: HEIC, TIFF and PSD are photos and WebM is a video, whatever the case of the extension', () => {
    const names = ['a.heic', 'b.HEIC', 'c.tif', 'd.TIFF', 'e.psd', 'f.webm'];
    expect(names.map((name) => classifyFile(name))).toEqual([
      'image',
      'image',
      'image',
      'image',
      'image',
      'video',
    ]);
  });

  it('ignores files of no known format', () => {
    for (const name of ['notes.txt', 'Thumbs.db', 'clip.mkv', 'no-extension', 'photo.jpg.part']) {
      expect(classifyFile(name)).toBeUndefined();
    }
  });

  it('R4: every kind belongs to exactly one media section', () => {
    expect(SECTION_BY_KIND).toEqual({
      image: 'photos',
      video: 'video',
      pdf: 'library',
      cbz: 'library',
      pagefolder: 'library',
    });
  });
});

describe('the page-folder rule', () => {
  it('takes a folder of two or more images named by number alone', () => {
    expect(isPageFolder({ subfolderCount: 0, fileNames: ['001.jpg', '002.jpg', '010.png'] })).toBe(
      true,
    );
  });

  it('leaves photo folders, mixed folders, single pages and nested folders alone', () => {
    const notPageFolders = [
      { subfolderCount: 0, fileNames: ['figure_0001.jpg', 'figure_0002.jpg'] },
      { subfolderCount: 0, fileNames: ['001.jpg', '002.jpg', 'notes.txt'] },
      { subfolderCount: 0, fileNames: ['001.jpg'] },
      { subfolderCount: 1, fileNames: ['001.jpg', '002.jpg'] },
      { subfolderCount: 0, fileNames: ['001.pdf', '002.pdf'] },
    ];
    for (const folder of notPageFolders) {
      expect(isPageFolder(folder)).toBe(false);
    }
  });

  it('orders pages by number, so 2 comes before 10', () => {
    expect(sortPageNames(['10.jpg', '2.jpg', '001.jpg'])).toEqual(['001.jpg', '2.jpg', '10.jpg']);
  });
});

describe('the fixture archive', () => {
  it('R4: every planned fixture file classifies as the kind it was made as', () => {
    const plan = planFixtures();
    const files = plan.filter((file) => file.kind !== 'pagefolder');
    const misfiled = files.filter((file) => classifyFile(file.relPath) !== file.kind);
    expect(misfiled).toEqual([]);
    const counts = { photos: 0, video: 0, library: 0 };
    for (const file of plan) {
      counts[SECTION_BY_KIND[file.kind]] += 1;
    }
    expect(counts).toEqual({ photos: 4312, video: 186, library: 74 });
  });
});
