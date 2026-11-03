// Where thumbnails live in the data folder and how big the default ones are
// (docs/ARCHITECTURE.md, Thumbnails and media).
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

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

/** The size the queue makes for each kind; other sizes are made when a page first asks. */
export function defaultThumbnailSize(kind: ItemKind): ThumbnailSize {
  return kind === 'image' || kind === 'video' ? DEFAULT_SQUARE : DEFAULT_COVER;
}

/** Names a size in file names: 320 for a square, 320x464 for a cover. */
function sizeLabel(size: ThumbnailSize): string {
  return size.width === size.height
    ? String(size.width)
    : `${String(size.width)}x${String(size.height)}`;
}

/**
 * The cache file for one item at one size, spread over 256 folders by item id so no folder
 * grows past a few hundred files: thumbs/1f/287-320.webp.
 */
export function thumbnailPath(thumbsDir: string, itemId: number, size: ThumbnailSize): string {
  const folder = (itemId % 256).toString(16).padStart(2, '0');
  return path.join(thumbsDir, folder, `${String(itemId)}-${sizeLabel(size)}.webp`);
}

/**
 * Saves a thumbnail. It is written beside its final name and then renamed, so a page never
 * reads half a file and a crash never leaves one behind under the real name.
 */
export async function saveThumbnail(file: string, webp: Buffer): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const partial = `${file}.${String(process.pid)}.partial`;
  await writeFile(partial, webp);
  await rename(partial, file);
}
