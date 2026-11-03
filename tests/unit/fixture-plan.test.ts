import { describe, expect, it } from 'vitest';

import { bookTitle } from '../../scripts/fixtures/library.ts';
import { planFixtures } from '../../scripts/fixtures/plan.ts';

const plan = planFixtures();
const paths = plan.map((file) => file.relPath);

/** Counts planned entries whose path starts with a folder. */
function countIn(folder: string): number {
  return paths.filter((relPath) => relPath.startsWith(`${folder}/`)).length;
}

describe('fixture plan matches the Sample content table in docs/DESIGN-BRIEF.md', () => {
  it('holds 4,312 images, 186 videos and 74 publications, 4,572 items in all', () => {
    const kinds = plan.map((file) => file.kind);
    expect(kinds.filter((kind) => kind === 'image')).toHaveLength(4312);
    expect(kinds.filter((kind) => kind === 'video')).toHaveLength(186);
    expect(kinds.filter((kind) => kind !== 'image' && kind !== 'video')).toHaveLength(74);
    expect(new Set(paths).size).toBe(4572);
  });

  it('puts each subcategory’s count in its folder', () => {
    expect(countIn('Figure')).toBe(1236);
    expect(countIn('Portrait')).toBe(1488);
    expect(countIn('Hands')).toBe(902);
    expect(countIn('Misc')).toBe(632);
    expect(countIn('Inbox')).toBe(54);
    expect(countIn('Video/Poses')).toBe(140);
    expect(countIn('Video/Timelapses')).toBe(46);
    expect(countIn('Books')).toBe(51);
    expect(countIn('Magazines')).toBe(23);
    expect(countIn('Magazines/Life Drawing Quarterly')).toBe(12);
  });

  it('has frame 5’s photo third in Figure at full size', () => {
    const figure = plan.filter((file) => file.relPath.startsWith('Figure/'));
    expect(figure[2]).toMatchObject({
      relPath: 'Figure/seated_backlit_017.jpg',
      width: 4032,
      height: 3024,
    });
    expect(figure.slice(192, 288).map((file) => file.relPath)).toEqual(
      Array.from({ length: 96 }, (_, i) => `Figure/figure_${String(193 + i).padStart(4, '0')}.jpg`),
    );
  });

  it('has frame 7’s video third in Poses, oldest first', () => {
    const poses = plan
      .filter((file) => file.relPath.startsWith('Video/Poses/'))
      .toSorted((left, right) => left.mtimeMs - right.mtimeMs);
    expect(poses[2]?.relPath).toBe('Video/Poses/pose_session_04_seated.mp4');
  });

  it('has frame 7’s video at 1920×1080, 30 fps and 3:15', () => {
    expect(plan.find((file) => file.relPath.endsWith('pose_session_04_seated.mp4'))).toMatchObject({
      width: 1920,
      height: 1080,
      fps: 30,
      durationSeconds: 195,
    });
  });

  it('names books as frame 2 does and gives them 96 to 355 pages', () => {
    expect(bookTitle(4)).toBe('Studies in Hands');
    expect(bookTitle(21)).toBe('Notes on Gesture, vol. 2');
    const books = plan.filter((file) => file.relPath.startsWith('Books/'));
    for (const book of books) {
      expect(book.pageCount).toBeGreaterThanOrEqual(96);
      expect(book.pageCount).toBeLessThanOrEqual(355);
    }
    expect(new Set(books.map((book) => book.kind))).toEqual(new Set(['pdf', 'cbz', 'pagefolder']));
  });

  it('gives Life Drawing Quarterly No. 12 (Winter 2023) 72 pages', () => {
    expect(
      plan.find((file) => file.relPath.endsWith('Life Drawing Quarterly No. 12.pdf')),
    ).toMatchObject({ title: 'Life Drawing Quarterly No. 12 · Winter 2023', pageCount: 72 });
  });

  it('includes every P0 format (docs/PRD.md, R6)', () => {
    const extensions = new Set(paths.map((relPath) => /\.([a-z0-9]+)$/.exec(relPath)?.[1]));
    for (const extension of ['jpg', 'png', 'webp', 'gif', 'mp4', 'mov', 'pdf', 'cbz']) {
      expect(extensions).toContain(extension);
    }
    expect(plan.some((file) => file.kind === 'pagefolder')).toBe(true);
  });

  it('has the Unsorted downloads download_001.jpg to download_054.jpg', () => {
    expect(paths.filter((relPath) => relPath.startsWith('Inbox/'))).toEqual(
      Array.from({ length: 54 }, (_, i) => `Inbox/download_${String(i + 1).padStart(3, '0')}.jpg`),
    );
  });

  it('makes portrait_1488.jpg the newest photo, for Home’s Recently added', () => {
    const photos = plan.filter((file) => file.kind === 'image');
    const newest = photos.toSorted((left, right) => right.mtimeMs - left.mtimeMs)[0];
    expect(newest?.relPath).toBe('Portrait/portrait_1488.jpg');
  });

  it('plans the same files on every run', () => {
    expect(planFixtures()).toEqual(plan);
  });
});
