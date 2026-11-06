// Turns a folder typed in Settings into a root and a path under it, and back again, so a folder
// mapping can be typed and shown as a full path (E:\Reference\Figure) but stored relative to its
// root, as items are.
import path from 'node:path';

import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { AppError } from '#core/errors.js';

import type { Root } from '#core/db/repositories/roots.js';

/** A folder under one of the roots: the root, and its path there with forward slashes. */
export type RootFolder = {
  readonly rootId: number;
  readonly relPrefix: string;
};

/** Removes the quotes Windows' "Copy as path" adds, and surrounding spaces. */
export function trimTypedPath(typed: string): string {
  return typed
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .trim();
}

/**
 * A folder's path inside a root with forward slashes, or undefined if it isn't inside it. On
 * Windows `path.relative` ignores case, as the drive does, and keeps the typed folder's own case.
 */
function relativeInside(root: Root, folder: string): string | undefined {
  const relative = path.relative(path.resolve(root.path), folder);
  const leadsOut = relative === '..' || relative.startsWith(`..${path.sep}`);
  if (leadsOut || path.isAbsolute(relative)) {
    return undefined;
  }
  return relative.split(path.sep).join('/');
}

/** Refuses a relative folder that is empty or climbs out of its root. */
function requireFolderInside(relPrefix: string, typed: string): string {
  const parts = relPrefix.split('/').filter((part) => part !== '');
  if (parts.length === 0) {
    throw new AppError(
      'invalid-input',
      `${typed} is a whole watched folder. Map a folder inside it, like Figure.`,
    );
  }
  if (parts.some((part) => part === '.' || part === '..')) {
    throw new AppError('invalid-input', `Type the folder without . or .. in it.`);
  }
  return parts.join('/');
}

/**
 * Finds which root a typed folder is in. A full path must be inside one of the roots; anything
 * else is read as a folder inside the Reference folder (`Video\Poses`).
 */
export function findRootFolder(roots: readonly Root[], typed: string): RootFolder {
  const trimmed = trimTypedPath(typed);
  if (trimmed === '') {
    throw new AppError('invalid-input', 'Type the folder to map, like E:\\Reference\\Figure.');
  }
  if (!path.isAbsolute(trimmed)) {
    const relPrefix = trimmed.replaceAll('\\', '/');
    return { rootId: REFERENCE_ROOT_ID, relPrefix: requireFolderInside(relPrefix, trimmed) };
  }
  const folder = path.resolve(trimmed);
  for (const root of roots) {
    const relPrefix = relativeInside(root, folder);
    if (relPrefix !== undefined) {
      return { rootId: root.id, relPrefix: requireFolderInside(relPrefix, trimmed) };
    }
  }
  throw new AppError(
    'invalid-input',
    `${trimmed} isn't inside a watched folder. Add its folder under Watched folders first.`,
  );
}

/** The full path of a folder under a root, as the PC writes it: what Settings shows. */
export function showRootFolder(root: Root, relPrefix: string): string {
  return path.join(root.path, ...relPrefix.split('/'));
}
