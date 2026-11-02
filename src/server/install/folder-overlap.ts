// Keeps the app's folders and the Reference folder apart, so the app never writes into a
// Reference root and deleting the app never deletes reference files (hard rule 7, R3).
import path from 'node:path';

import { AppError } from '#core/errors.js';

/** The folders setup is about to use. The data folder is unknown while only the Reference is checked. */
export type SetupFolders = {
  readonly homeDir: string;
  readonly referenceDir: string;
  readonly dataDir?: string;
};

/** Makes a path absolute, and lower-case on Windows, where paths ignore case. */
function normalizeForCompare(target: string): string {
  const absolute = path.resolve(target);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

/** Says whether a folder is the same as, or inside, another. */
export function isSameOrInside(folder: string, container: string): boolean {
  const relative = path.relative(normalizeForCompare(container), normalizeForCompare(folder));
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** Says whether either folder holds the other. */
function overlaps(first: string, second: string): boolean {
  return isSameOrInside(first, second) || isSameOrInside(second, first);
}

/** Refuses a Reference folder that holds, or sits inside, the app or its data folder. */
export function refuseOverlappingFolders(folders: SetupFolders): void {
  if (overlaps(folders.homeDir, folders.referenceDir)) {
    throw new AppError(
      'folder-overlap',
      `Morgue File and the Reference folder ${folders.referenceDir} must be separate folders, ` +
        'neither one inside the other. Move the MorgueFile folder or pick another Reference folder.',
    );
  }
  if (folders.dataDir !== undefined && overlaps(folders.dataDir, folders.referenceDir)) {
    throw new AppError(
      'folder-overlap',
      `The data folder ${folders.dataDir} can't be inside the Reference folder, or hold it. ` +
        'Choose a data folder somewhere else.',
    );
  }
}
