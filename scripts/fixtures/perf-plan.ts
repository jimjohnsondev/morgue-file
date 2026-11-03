// The synthetic 50,000-item library the performance tests time queries and pages against. Only
// rows are made, no files: perf tests measure the database and templates, not the disk.
import { padNumber } from './fixture-file.ts';
import { createRandom, pickFrom, type Random, wholeNumberBetween } from './random.ts';

/** How many items the perf library holds (docs/PRD.md, R24: 200 ms at 50,000 items). */
export const PERF_ITEM_COUNT = 50_000;

/** One synthetic item, with the tags, model and rating search filters on. */
export type PerfItem = {
  readonly relPath: string;
  readonly kind: 'image' | 'video' | 'pdf';
  readonly subcategory: string;
  readonly width: number;
  readonly height: number;
  readonly size: number;
  readonly mtimeMs: number;
  readonly tags: readonly string[];
  readonly model?: string;
  readonly rating?: number;
};

/** Sections in the proportions of the sample archive: mostly photos. */
const SHARES = [
  { kind: 'image', subcategories: ['Figure', 'Portrait', 'Hands', 'Drapery'], share: 0.92 },
  { kind: 'video', subcategories: ['Poses', 'Timelapses'], share: 0.04 },
  { kind: 'pdf', subcategories: ['Books', 'Magazines'], share: 0.04 },
] as const;

const TAG_COUNT = 300;
const MODEL_COUNT = 40;
const FIRST_DATE = Date.parse('2015-01-01');
const LAST_DATE = Date.parse('2026-10-31');

/** Makes the same 50,000 items on every run. */
export function planPerfItems(count = PERF_ITEM_COUNT): PerfItem[] {
  const random = createRandom(50_000);
  const items: PerfItem[] = [];
  for (let index = 1; index <= count; index++) {
    items.push(planPerfItem(random, index));
  }
  return items;
}

/** One item: a section by share, then a subcategory, size, date, tags, model and rating. */
function planPerfItem(random: Random, index: number): PerfItem {
  const section = sectionFor(random());
  const subcategory = pickFrom(random, section.subcategories);
  const tags = Array.from(
    { length: wholeNumberBetween(random, 0, 3) },
    () => `tag-${padNumber(wholeNumberBetween(random, 1, TAG_COUNT), 3)}`,
  );
  const model =
    random() < 0.1 ? `Model ${String(wholeNumberBetween(random, 1, MODEL_COUNT))}` : undefined;
  const rating = random() < 0.3 ? wholeNumberBetween(random, 1, 5) : undefined;
  return {
    relPath: `${subcategory}/perf_${padNumber(index, 5)}.${extensionFor(section.kind)}`,
    kind: section.kind,
    subcategory,
    width: 4032,
    height: 3024,
    size: wholeNumberBetween(random, 200_000, 9_000_000),
    mtimeMs: FIRST_DATE + Math.floor(random() * (LAST_DATE - FIRST_DATE)),
    tags: [...new Set(tags)],
    ...(model === undefined ? {} : { model }),
    ...(rating === undefined ? {} : { rating }),
  };
}

/** Picks a section from a roll in [0, 1), each with its share of the rolls. */
function sectionFor(roll: number): (typeof SHARES)[number] {
  let upTo = 0;
  for (const section of SHARES) {
    upTo += section.share;
    if (roll < upTo) {
      return section;
    }
  }
  return SHARES[0];
}

/** The file extension for a kind of perf item. */
function extensionFor(kind: PerfItem['kind']): string {
  return { image: 'jpg', video: 'mp4', pdf: 'pdf' }[kind];
}
