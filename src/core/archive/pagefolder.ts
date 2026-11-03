// The page-folder rule: a folder of scanned pages is one Library item, not many photos
// (docs/ARCHITECTURE.md, Indexing and the page-folder risk).
import path from 'node:path';

import { isImageFileName } from './classify.js';

/** What the rule needs to know about one folder. */
export type FolderShape = {
  readonly subfolderCount: number;
  readonly fileNames: readonly string[];
};

/** A page scan is named by its number alone, as in 001.jpg. */
const PAGE_NAME = /^\d+$/;

/** Says whether a file is a page scan: an image whose name is a number and nothing else. */
export function isPageFileName(fileName: string): boolean {
  const stem = path.basename(fileName, path.extname(fileName));
  return isImageFileName(fileName) && PAGE_NAME.test(stem);
}

/**
 * Says whether a folder is a page folder: no subfolders and two or more files, every one a page
 * scan. The rule is stricter than "numbered images" so a photo folder such as Figure/, whose
 * files are named figure_0001.jpg, stays a folder of photos.
 */
export function isPageFolder(folder: FolderShape): boolean {
  return (
    folder.subfolderCount === 0 &&
    folder.fileNames.length >= 2 &&
    folder.fileNames.every((name) => isPageFileName(name))
  );
}

/** Returns page file names in reading order: by number, so 2.jpg comes before 10.jpg. */
export function sortPageNames(fileNames: readonly string[]): string[] {
  return [...fileNames].sort((left, right) =>
    left.localeCompare(right, 'en', { numeric: true, sensitivity: 'base' }),
  );
}
