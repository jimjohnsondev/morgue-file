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

/** Files Windows keeps beside pictures; never part of an archive. */
const SYSTEM_FILE_NAMES: ReadonlySet<string> = new Set([
  'thumbs.db',
  'ehthumbs.db',
  'ehthumbs_vista.db',
  'desktop.ini',
]);

/** Folders operating systems and archive tools make; nothing in them is a reference. */
const SYSTEM_FOLDER_NAMES: ReadonlySet<string> = new Set([
  '__macosx',
  '$recycle.bin',
  'system volume information',
]);

/**
 * Says whether a file or folder is operating-system clutter the archive skips. A name starting
 * with a dot is one: macOS writes "._name.jpg" beside every file it copies to a Windows drive, a
 * few bytes of metadata with an image's extension, which would otherwise index as a broken photo
 * and stop a folder of page scans from counting as a page folder.
 */
export function isSystemEntry(name: string, isFolder: boolean): boolean {
  if (name.startsWith('.')) {
    return true;
  }
  const lowerName = name.toLowerCase();
  return isFolder ? SYSTEM_FOLDER_NAMES.has(lowerName) : SYSTEM_FILE_NAMES.has(lowerName);
}
