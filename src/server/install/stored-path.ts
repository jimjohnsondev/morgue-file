// Turns folder paths into the form saved in the app's settings files, and back again.
import path from 'node:path';

/** The path functions for one platform. Tests pass path.win32 to check the Windows rules. */
export type PathApi = Pick<typeof path, 'resolve' | 'relative' | 'parse'>;

/** Says whether two absolute paths are on the same drive. Windows drive letters ignore case. */
function isSameDrive(first: string, second: string, pathApi: PathApi): boolean {
  return pathApi.parse(first).root.toLowerCase() === pathApi.parse(second).root.toLowerCase();
}

/**
 * Returns the path to save for a folder: relative to the home folder when both are on the same
 * drive, so a USB drive keeps working under any drive letter, and absolute otherwise (R29).
 */
export function toStoredPath(homeDir: string, folder: string, pathApi: PathApi = path): string {
  const absoluteFolder = pathApi.resolve(folder);
  if (!isSameDrive(homeDir, absoluteFolder, pathApi)) {
    return absoluteFolder;
  }
  const relativeFolder = pathApi.relative(homeDir, absoluteFolder);
  return relativeFolder === '' ? '.' : relativeFolder;
}

/** Turns a saved path back into an absolute one, reading relative paths from the home folder. */
export function resolveStoredPath(
  homeDir: string,
  stored: string,
  pathApi: PathApi = path,
): string {
  return pathApi.resolve(homeDir, stored);
}
