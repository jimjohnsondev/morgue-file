// Adds a watched folder from Settings, or points one at its folder's new location (R1, R36).
// The Reference folder's location is also saved in settings.json, which the next launch reads.
import path from 'node:path';

import { createInbox, inspectReferenceFolder } from '#core/archive/originals.js';
import {
  findAllRoots,
  findRootById,
  insertRoot,
  REFERENCE_ROOT_ID,
  setRootPath,
} from '#core/db/repositories/roots.js';
import { AppError } from '#core/errors.js';

import { updateDataSettings } from './install/data-folder.js';
import { isSameOrInside } from './install/folder-overlap.js';
import { requireFullPath } from './install/setup.js';
import { toStoredPath } from './install/stored-path.js';
import { requireLibrary } from './routes/require-library.js';

import type { Root } from '#core/db/repositories/roots.js';
import type { InstallStateHolder } from './install/install-state.js';
import type { LibraryRuntime } from './library-runtime.js';

/** What changing watched folders needs: the app folder, the install and the library. */
export type WatchedFolderContext = {
  readonly homeDir: string;
  readonly install: InstallStateHolder;
  readonly library: LibraryRuntime | undefined;
};

/** Says whether either folder holds the other. */
function overlaps(first: string, second: string): boolean {
  return isSameOrInside(first, second) || isSameOrInside(second, first);
}

/**
 * Refuses a folder that holds, or sits inside, the app, its data folder or another watched
 * folder: a file must belong to one root only, and the app never indexes its own files.
 */
function refuseOverlap(context: WatchedFolderContext, folder: string, others: readonly Root[]) {
  const { install } = context;
  const dataDir = install.current.kind === 'ready' ? install.current.dataDir : undefined;
  if (overlaps(folder, context.homeDir) || (dataDir !== undefined && overlaps(folder, dataDir))) {
    throw new AppError(
      'folder-overlap',
      `${folder} holds Morgue File's own folders, or is inside them. Pick a folder of reference files.`,
    );
  }
  const holder = others.find((root) => overlaps(folder, root.path));
  if (holder !== undefined) {
    throw new AppError(
      'folder-overlap',
      `${folder} overlaps the watched folder ${holder.path}. A file can be watched only once.`,
    );
  }
}

/** Checks a typed folder can be watched, and returns its full path. */
async function requireWatchableFolder(
  context: WatchedFolderContext,
  typed: string,
  others: readonly Root[],
): Promise<string> {
  const folder = requireFullPath(typed);
  await inspectReferenceFolder(folder);
  refuseOverlap(context, folder, others);
  return folder;
}

/** Adds a folder to watch and starts indexing it. Returns its root id. */
export async function addWatchedFolder(context: WatchedFolderContext, typed: string) {
  const { db } = requireLibrary(context.library);
  const folder = await requireWatchableFolder(context, typed, findAllRoots(db));
  const rootId = insertRoot(db, folder, path.basename(folder) || folder);
  context.library?.watchRoot(rootId);
  return rootId;
}

/** Saves the Reference folder's new location where the next launch looks for it. */
async function saveReferenceLocation(context: WatchedFolderContext, folder: string) {
  const { install } = context;
  if (install.current.kind !== 'ready') {
    throw new AppError('setup-required', 'Finish setup before moving the Reference folder.');
  }
  await updateDataSettings(install.current.dataDir, {
    referenceDir: toStoredPath(context.homeDir, folder),
    referenceDirAbsolute: folder,
  });
  // Drops and pastes go to its Inbox, which a copied drive may not have yet.
  await createInbox(folder);
  install.current = { ...install.current, referenceDir: folder };
}

/**
 * Points a watched folder at its new location (a new drive letter, a renamed folder) and scans
 * it there. Items keep their paths relative to it, so tags and collections stay with them.
 */
export async function moveWatchedFolder(
  context: WatchedFolderContext,
  rootId: number,
  typed: string,
): Promise<void> {
  const { db } = requireLibrary(context.library);
  if (findRootById(db, rootId) === undefined) {
    throw new AppError('not-found', `No watched folder ${String(rootId)}.`);
  }
  const others = findAllRoots(db).filter((root) => root.id !== rootId);
  const folder = await requireWatchableFolder(context, typed, others);
  if (rootId === REFERENCE_ROOT_ID) {
    await saveReferenceLocation(context, folder);
  }
  setRootPath(db, rootId, folder);
  context.library?.rescanRoot(rootId);
}
