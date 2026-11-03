// Where thumbnails live in the data folder and how big the default ones are
// (docs/ARCHITECTURE.md, Thumbnails and media).
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { systemErrorCode } from '#core/errors.js';

import type { ItemKind } from '#core/db/repositories/items.js';

/** The folder in the data folder that holds the thumbnail cache. */
export const THUMBS_FOLDER_NAME = 'thumbs';

/** A thumbnail's pixel size. Files are made at twice the size they're shown at. */
export type ThumbnailSize = {
  readonly width: number;
  readonly height: number;
};

/** Medium squares (160 px shown) are the default for photos and videos. */
export const DEFAULT_SQUARE: ThumbnailSize = { width: 320, height: 320 };

/** Library covers are shown at 160×232. */
export const DEFAULT_COVER: ThumbnailSize = { width: 320, height: 464 };

/** Square thumbnails at Small (120 px shown), Medium (160) and Large (240), made at twice that. */
export const SQUARE_SIZES = {
  small: { width: 240, height: 240 },
  medium: DEFAULT_SQUARE,
  large: { width: 480, height: 480 },
} as const satisfies Readonly<Record<string, ThumbnailSize>>;

/** The thumbnail sizes a page can choose between. */
export type SquareSizeName = keyof typeof SQUARE_SIZES;

/** The size the queue makes for each kind; other sizes are made when a page first asks. */
export function defaultThumbnailSize(kind: ItemKind): ThumbnailSize {
  return hasSquareThumbnail(kind) ? DEFAULT_SQUARE : DEFAULT_COVER;
}

/** Names a size in file names: 320 for a square, 320x464 for a cover. */
export function sizeToLabel(size: ThumbnailSize): string {
  return size.width === size.height
    ? String(size.width)
    : `${String(size.width)}x${String(size.height)}`;
}

/** Says whether an item's thumbnails are squares (photos and videos) rather than covers. */
export function hasSquareThumbnail(kind: ItemKind): boolean {
  return kind === 'image' || kind === 'video';
}

/** Reads a size back from its label in a URL (`320`, `320x464`), or undefined for any other. */
export function parseSizeLabel(label: string): ThumbnailSize | undefined {
  const sizes: ThumbnailSize[] = [...Object.values(SQUARE_SIZES), DEFAULT_COVER];
  return sizes.find((size) => sizeToLabel(size) === label);
}

/**
 * The cache file for one item at one size, spread over 256 folders by item id so no folder
 * grows past a few hundred files: thumbs/1f/287-320.webp.
 */
export function thumbnailPath(thumbsDir: string, itemId: number, size: ThumbnailSize): string {
  const folder = (itemId % 256).toString(16).padStart(2, '0');
  return path.join(thumbsDir, folder, `${String(itemId)}-${sizeToLabel(size)}.webp`);
}

/**
 * Saves a thumbnail. It is written beside its final name and then renamed, so a page never
 * reads half a file and a crash never leaves one behind under the real name.
 */
export async function saveThumbnail(file: string, webp: Buffer): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  // Unique per call: a page can ask for a size while another request is making it.
  const partial = `${file}.${String(process.pid)}-${randomUUID()}.partial`;
  await writeFile(partial, webp);
  await rename(partial, file);
}

/** Reads a cached thumbnail, or returns undefined if it hasn't been made. */
export async function readThumbnail(file: string): Promise<Buffer | undefined> {
  try {
    return await readFile(file);
  } catch (error) {
    if (systemErrorCode(error) === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}
