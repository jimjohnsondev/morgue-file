// How numbers, dates and media details read on the page: "1,236", "31 Oct 2026", "3:15".
import type { ListedItem } from '#core/db/repositories/item-lists.js';
import type { FieldWithValue } from '#core/fields/fields.js';

const COUNT = new Intl.NumberFormat('en-US');

const DAY_MONTH_YEAR = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Writes a count with thousands separators, as the brief's counters do: 4,312. */
export function formatCount(count: number): string {
  return COUNT.format(count);
}

/** Writes an ISO time as a day, as in "site last updated 31 Oct 2026". */
export function formatDay(isoTime: string): string {
  return DAY_MONTH_YEAR.format(new Date(isoTime));
}

/** Writes a length of time as minutes and seconds, or hours too past an hour: 3:15, 1:02:07. */
export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${String(totalMinutes)}:${seconds}`;
  }
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${String(Math.floor(totalMinutes / 60))}:${minutes}:${seconds}`;
}

/**
 * The name an item shows under its thumbnail: the file name for photos and videos, and the title
 * without its extension for Library items ("Notes on Gesture, vol. 2").
 */
export function itemLabel(item: Pick<ListedItem, 'relPath' | 'section'>): string {
  const fileName = item.relPath.split('/').at(-1) ?? item.relPath;
  return item.section === 'library' ? fileName.replace(/\.(pdf|cbz)$/i, '') : fileName;
}

/** How each Library kind is named in captions. */
const PUBLICATION_FORMAT: Readonly<Record<string, string>> = {
  pdf: 'PDF',
  cbz: 'CBZ',
  pagefolder: 'page folder',
};

/**
 * The line under a thumbnail: pixel size for photos, size and length for videos, pages and
 * format for Library items. Details not known yet (no thumbnail made) are left out.
 */
export function itemDetails(item: ListedItem): string {
  const size =
    item.width === undefined || item.height === undefined
      ? undefined
      : `${String(item.width)}×${String(item.height)}`;
  if (item.kind === 'image') {
    return size ?? '';
  }
  if (item.kind === 'video') {
    const length = item.durationMs === undefined ? undefined : formatDuration(item.durationMs);
    return [size, length].filter((part) => part !== undefined).join(' · ');
  }
  const pages = item.pageCount === undefined ? undefined : `${String(item.pageCount)} pages`;
  return [pages, PUBLICATION_FORMAT[item.kind]].filter((part) => part !== undefined).join(' · ');
}

/** How each file type is named on the page, by extension or Library kind. */
const FORMAT_NAMES: Readonly<Record<string, string>> = {
  jpg: 'JPG',
  jpeg: 'JPG',
  png: 'PNG',
  webp: 'WebP',
  gif: 'GIF',
  mp4: 'MP4',
  mov: 'MOV',
  pdf: 'PDF',
  cbz: 'CBZ',
  pagefolder: 'Page folder',
};

/** The format line of an item's details: JPG, MP4, PDF, Page folder. */
export function formatName(item: Pick<ListedItem, 'relPath' | 'kind'>): string {
  const extension =
    item.kind === 'pagefolder' ? 'pagefolder' : (item.relPath.split('.').at(-1) ?? '');
  return FORMAT_NAMES[extension.toLowerCase()] ?? extension.toUpperCase();
}

/** A rating out of 5 as stars: ★★★★☆. */
export function formatStars(rating: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

/** A link as the details panel shows it: without the scheme or a trailing slash. */
export function formatLinkText(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/** A page range for chips and the reader: "page 12", "pages 12–19". */
export function formatPages(first: number, last: number): string {
  return first === last ? `page ${String(first)}` : `pages ${String(first)}–${String(last)}`;
}

/** A field's value as text: dates as days, numbers as numbers, undefined when it has none. */
export function fieldValueText(entry: FieldWithValue): string | undefined {
  if (entry.value === undefined) {
    return undefined;
  }
  return entry.field.type === 'date' ? formatDay(String(entry.value)) : String(entry.value);
}
