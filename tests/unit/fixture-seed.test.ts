import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { planFixtures } from '../../scripts/fixtures/plan.ts';
import {
  findUnmatchedPatterns,
  loadSeed,
  matchItems,
  patternToRegExp,
} from '../../scripts/fixtures/seed.ts';

const seed = await loadSeed(path.resolve(import.meta.dirname, '../../fixtures/seed.json'));
const paths = planFixtures().map((file) => file.relPath);

/** Every item pattern anywhere in the seed. */
function allPatterns(): string[] {
  return [
    ...seed.filedByHand.flatMap((entry) => entry.items),
    ...seed.itemFieldValues.flatMap((entry) => entry.items),
    ...seed.models.flatMap((model) => model.appearsIn.flatMap((entry) => entry.items)),
    ...seed.models.map((model) => model.portrait),
    ...seed.tags.flatMap((tag) => tag.items),
    ...seed.collections.flatMap((collection) => collection.items),
    ...seed.views.map((view) => view.item),
  ];
}

/** The paths a model appears in. */
function appearances(modelName: string): Set<string> {
  const model = seed.models.find((candidate) => candidate.name === modelName);
  return new Set(model?.appearsIn.flatMap((entry) => matchItems(entry.items, paths)));
}

describe('item patterns', () => {
  it('match within one folder with * and across folders with **/', () => {
    expect(patternToRegExp('Misc/drapery_*').test('Misc/drapery_0001.png')).toBe(true);
    expect(patternToRegExp('Misc/*').test('Misc/a/b.jpg')).toBe(false);
    expect(patternToRegExp('**/*_elena_*.jpg').test('Figure/figure_elena_103.jpg')).toBe(true);
    expect(
      patternToRegExp('Books/Notes on Gesture, vol. 2.pdf').test(
        'Books/Notes on Gesture, vol. 2Xpdf',
      ),
    ).toBe(false);
  });
});

describe('fixtures/seed.json matches the Sample content table in docs/DESIGN-BRIEF.md', () => {
  it('names only items the fixture archive has', () => {
    expect(findUnmatchedPatterns(allPatterns(), paths)).toEqual([]);
  });

  it('maps the brief’s folders and files Drapery by hand', () => {
    const counts = new Map<string, number>();
    for (const subcategory of seed.subcategories) {
      const patterns = subcategory.folders.map((folder) => `${folder}/**/*`);
      counts.set(subcategory.name, patterns.length === 0 ? 0 : matchItems(patterns, paths).length);
    }
    const drapery = seed.filedByHand.find((entry) => entry.subcategory === 'Drapery');
    counts.set('Drapery', matchItems(drapery?.items ?? [], paths).length);
    expect(Object.fromEntries(counts)).toEqual({
      Figure: 1236,
      Portrait: 1488,
      Hands: 902,
      Drapery: 632,
      Poses: 140,
      Timelapses: 46,
      Books: 51,
      Magazines: 23,
    });
  });

  it('has 38 collections, the 4 named ones first', () => {
    expect(seed.collections).toHaveLength(38);
    expect(seed.collections.slice(0, 4).map((collection) => collection.name)).toEqual([
      'Spring model session',
      'Gouache palettes',
      'Hands foreshortened',
      'Old masters drapery',
    ]);
  });

  it('has the seven tags of the brief', () => {
    expect(seed.tags.map((tag) => tag.name)).toEqual([
      'hands',
      'foreshortened',
      'back-lit',
      'seated',
      'contrapposto',
      'profile',
      'three-quarter',
    ]);
  });

  it('puts Elena Varga in 212 photos and 4 Library items, and no videos', () => {
    const elena = [...appearances('Elena Varga')];
    expect(elena.filter((item) => /\.(jpg|png|webp|gif)$/.test(item))).toHaveLength(212);
    expect(elena.filter((item) => /^(Books|Magazines)\//.test(item))).toHaveLength(4);
    expect(elena.filter((item) => item.startsWith('Video/'))).toHaveLength(0);
  });

  it('gives tag:hands model:Elena 38 results, 34 in Photos and 4 in Library (frame 4)', () => {
    const elena = appearances('Elena Varga');
    const hands = seed.tags.find((tag) => tag.name === 'hands');
    const results = matchItems(hands?.items ?? [], paths).filter((item) => elena.has(item));
    expect(results).toHaveLength(38);
    expect(results.filter((item) => /^(Books|Magazines)\//.test(item))).toHaveLength(4);
  });

  it('tags and files frame 5’s photo as the brief says', () => {
    const photo = 'Figure/seated_backlit_017.jpg';
    const tags = seed.tags.filter((tag) => matchItems(tag.items, [photo]).length > 0);
    expect(tags.map((tag) => tag.name)).toEqual(['hands', 'back-lit', 'seated']);
    const values = seed.itemFieldValues.find((entry) => entry.items.includes(photo))?.values;
    expect(values).toEqual({ rating: 4, source_url: 'https://example.com/seated-backlit' });
  });
});
