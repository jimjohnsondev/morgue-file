// Where thumbnails live in the data folder and how big the default ones are
// (docs/ARCHITECTURE.md, Thumbnails and media).
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

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

/**
 * A page of the reader's strip (R21) is shown at 46×60, the --page-strip-* sizes in tokens.css.
 * These are made each time the browser asks, not kept in the cache: their address carries the
 * original's time and size, so the browser keeps them until the file changes.
 */
export const PAGE_STRIP_SIZE: ThumbnailSize = { width: 92, height: 120 };

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

/** The cache folder of an item: 256 folders by item id, so none grows past a few hundred files. */
function cacheFolder(thumbsDir: string, itemId: number): string {
  return path.join(thumbsDir, (itemId % 256).toString(16).padStart(2, '0'));
}

/** The cache file for one item at one size: thumbs/1f/287-320.webp. */
export function thumbnailPath(thumbsDir: string, itemId: number, size: ThumbnailSize): string {
  return path.join(cacheFolder(thumbsDir, itemId), `${String(itemId)}-${sizeToLabel(size)}.webp`);
}

/**
 * Deletes every cached file of an item (each thumbnail size and its viewer copy). A thumbnail job
 * starts with this: the job remakes them from the file as it is now, and anything older may belong
 * to an earlier version of the file, or to a removed item that had the same id.
 */
export async function deleteItemCacheFiles(thumbsDir: string, itemId: number): Promise<void> {
  const folder = cacheFolder(thumbsDir, itemId);
  let names: string[];
  try {
    names = await readdir(folder);
  } catch (error) {
    if (systemErrorCode(error) === 'ENOENT') {
      return;
    }
    throw error;
  }
  const prefix = `${String(itemId)}-`;
  for (const name of names.filter((fileName) => fileName.startsWith(prefix))) {
    await rm(path.join(folder, name), { force: true });
  }
}

/**
 * The full-size JPEG copy of a photo the browser can't show (HEIC, TIFF, PSD), beside its
 * thumbnails: thumbs/1f/287-view.jpg.
 */
export function viewerCopyPath(thumbsDir: string, itemId: number): string {
  return path.join(cacheFolder(thumbsDir, itemId), `${String(itemId)}-view.jpg`);
}

/**
 * Saves a thumbnail or viewer copy. It is written beside its final name and then renamed, so a
 * page never reads half a file and a crash never leaves one behind under the real name.
 */
export async function saveCacheFile(file: string, bytes: Buffer): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  // Unique per call: a page can ask for a size while another request is making it.
  const partial = `${file}.${String(process.pid)}-${randomUUID()}.partial`;
  await writeFile(partial, bytes);
  await rename(partial, file);
}

/** Reads a cached thumbnail or viewer copy, or returns undefined if it hasn't been made. */
export async function readCacheFile(file: string): Promise<Buffer | undefined> {
  try {
    return await readFile(file);
  } catch (error) {
    if (systemErrorCode(error) === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

/** How often, and how far apart, setting the cache aside is tried while Windows holds a file. */
const SET_ASIDE_TRIES = 5;
const SET_ASIDE_WAIT_MS = 200;

/** Renames a folder, trying again while Windows reports a file in it as in use. */
async function renameFolder(folder: string, newName: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(folder, newName);
      return;
    } catch (error) {
      const code = systemErrorCode(error);
      if (attempt >= SET_ASIDE_TRIES || (code !== 'EPERM' && code !== 'EBUSY')) {
        throw error;
      }
      await setTimeout(SET_ASIDE_WAIT_MS);
    }
  }
}

/**
 * Empties the thumbnail cache, as a restore must (R26): its files are named by item id, and the
 * restored library may give those ids to other files. The folder is renamed at once, so pages
 * ask for fresh thumbnails straight away, and the old one is returned to be deleted at leisure.
 */
export async function setThumbnailCacheAside(thumbsDir: string): Promise<string | undefined> {
  const asideDir = `${thumbsDir}-discarded-${randomUUID()}`;
  try {
    await renameFolder(thumbsDir, asideDir);
  } catch (error) {
    if (systemErrorCode(error) === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
  return asideDir;
}

/** Deletes a thumbnail folder set aside by a restore. */
export async function deleteThumbnailFolder(folder: string): Promise<void> {
  await rm(folder, { recursive: true, force: true });
}
