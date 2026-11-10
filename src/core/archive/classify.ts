// Decides what kind of item a file is from its extension (docs/ARCHITECTURE.md, Indexing).
import path from 'node:path';

import type { ItemKind } from '#core/db/repositories/items.js';

/** The kinds a single file can be. A page folder is a folder, so it isn't one of them. */
export type FileKind = Exclude<ItemKind, 'pagefolder'>;

/** Every P0 format (R6) and P1 format (R7), by lower-case extension. */
const KIND_BY_EXTENSION: ReadonlyMap<string, FileKind> = new Map([
  ['.jpg', 'image'],
  ['.jpeg', 'image'],
  ['.png', 'image'],
  ['.webp', 'image'],
  ['.gif', 'image'],
  ['.heic', 'image'],
  ['.tif', 'image'],
  ['.tiff', 'image'],
  ['.psd', 'image'],
  ['.mp4', 'video'],
  ['.mov', 'video'],
  ['.webm', 'video'],
  ['.pdf', 'pdf'],
  ['.cbz', 'cbz'],
]);

/**
 * Returns the kind of a file from its name, or undefined for a file the archive ignores. Case is
 * ignored, as Windows does, so `IMG_0001.JPG` is an image.
 */
export function classifyFile(fileName: string): FileKind | undefined {
  return KIND_BY_EXTENSION.get(path.extname(fileName).toLowerCase());
}

/** Says whether a file name is an image the archive can show. */
export function isImageFileName(fileName: string): boolean {
  return classifyFile(fileName) === 'image';
}
