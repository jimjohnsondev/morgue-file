// The shape of one fixture entry, shared by the planners and the writers.

/** What the generator makes for one fixture entry; a page folder is one entry. */
export type FixtureKind = 'image' | 'video' | 'pdf' | 'cbz' | 'pagefolder';

/** One file or page folder of the fixture archive. */
export type FixtureFile = {
  /** Path under the Reference folder, with forward slashes. */
  readonly relPath: string;
  readonly kind: FixtureKind;
  /** Last-modified time in ms since the epoch, so "newest first" orders match the mocks. */
  readonly mtimeMs: number;
  /** Pixel size for images and videos. */
  readonly width?: number;
  readonly height?: number;
  readonly fps?: number;
  readonly durationSeconds?: number;
  /** Cover title and page count for publications. */
  readonly title?: string;
  readonly pageCount?: number;
};

/** Adds whole minutes to a date given as an ISO string, for spacing out file times. */
export function minutesAfter(isoDate: string, minutes: number): number {
  return Date.parse(isoDate) + minutes * 60_000;
}

/** Pads a number with leading zeros, as in figure_0193.jpg. */
export function padNumber(value: number, digits: number): string {
  return String(value).padStart(digits, '0');
}
