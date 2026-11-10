// Restores the library from a backup zip sent from Settings (R26). The current library is copied
// into the backups folder first, then the library stops, the backup's library.db takes its place
// and the library starts again, so indexing finds the archive's files as the backup knew them.
import path from 'node:path';

import { makeRestoreFiles, saveStream, unpackBackup } from '#core/backup/restore-zip.js';
import {
  checkRestoredDatabase,
  copyLibraryFiles,
  replaceLibraryFile,
} from '#core/db/library-file.js';
import { BACKUPS_FOLDER_NAME } from '#core/db/library.js';
import { backUpLibrary, backupFilePath, pruneBackups } from '#core/db/migrations.js';
import { AppError } from '#core/errors.js';
import {
  deleteThumbnailFolder,
  setThumbnailCacheAside,
  THUMBS_FOLDER_NAME,
} from '#core/jobs/thumbnail-files.js';

import type { InstallStateHolder } from './install/install-state.js';
import type { LibraryRuntime, ReadyInstall } from './library-runtime.js';
import type { FastifyBaseLogger } from 'fastify';

/** What a restore needs from the app. */
export type RestoreContext = {
  readonly install: InstallStateHolder;
  readonly library: LibraryRuntime | undefined;
  readonly appVersion: string;
  readonly log: FastifyBaseLogger;
};

/** The set-up install and the library it holds. */
type Ready = { readonly install: ReadyInstall; readonly library: LibraryRuntime };

/** The set-up install and its library, or a refusal while there is neither. */
function requireRestorable(context: RestoreContext): Ready {
  const install = context.install.current;
  if (install.kind !== 'ready' || context.library === undefined) {
    throw new AppError('library-unavailable', 'Finish setup before restoring a backup.');
  }
  return { install, library: context.library };
}

/**
 * Copies the library into the backups folder, as migrations do, so a restore can be undone. An
 * open library is copied through SQLite; one that failed to open at launch (a held lock, a
 * migration a later release fixes) is copied as it lies on disk, with its write-ahead log, since
 * it may still hold the user's only copy of their work. Undefined when there is no library file.
 */
async function keepCurrentLibrary(context: RestoreContext, install: ReadyInstall) {
  const options = {
    backupsDir: path.join(install.dataDir, BACKUPS_FOLDER_NAME),
    appVersion: context.appVersion,
    now: new Date(),
  };
  const open = context.library?.open();
  if (open !== undefined) {
    return backUpLibrary(open.db, options);
  }
  const kept = await copyLibraryFiles(install.dataDir, backupFilePath(options));
  pruneBackups(options.backupsDir);
  return kept;
}

/** Empties the thumbnail cache, deleting the old files in the background. */
async function discardThumbnails(install: ReadyInstall, log: FastifyBaseLogger): Promise<void> {
  const aside = await setThumbnailCacheAside(path.join(install.dataDir, THUMBS_FOLDER_NAME));
  if (aside !== undefined) {
    void deleteInBackground(aside, log);
  }
}

/** Deletes a folder without holding up the restore; a failure leaves it for the user to delete. */
async function deleteInBackground(folder: string, log: FastifyBaseLogger): Promise<void> {
  try {
    await deleteThumbnailFolder(folder);
  } catch (error) {
    log.warn({ err: error, folder }, 'Could not delete the thumbnails a restore set aside');
  }
}

/**
 * Stops the library, puts a database file in its place, empties the thumbnail cache and starts
 * the library again, whatever happened in between. Says whether the library opened.
 */
async function swapLibrary(ready: Ready, databaseFile: string, log: FastifyBaseLogger) {
  await ready.library.stop();
  try {
    await replaceLibraryFile(ready.install.dataDir, databaseFile);
    await discardThumbnails(ready.install, log);
  } finally {
    ready.library.start(ready.install, log);
  }
  return ready.library.open() !== undefined;
}

/**
 * Puts the library a restore replaced back, if it was copied first. A failure here is logged, so
 * the caller can report what went wrong first.
 */
async function putBack(ready: Ready, kept: string | undefined, log: FastifyBaseLogger) {
  if (kept === undefined) {
    return;
  }
  try {
    await swapLibrary(ready, kept, log);
  } catch (error) {
    log.error({ err: error, kept }, 'Could not put the library back after a failed restore');
  }
}

/** Why a restored library that won't open was refused, and where the old one is. */
function unopenedMessage(kept: string | undefined): string {
  return kept === undefined
    ? 'The library in that backup could not be opened.'
    : 'The library in that backup could not be opened, so the library was put back as it was.';
}

/** Swaps in the restored library, or puts the old one back if that fails or it won't open. */
async function swapInRestored(context: RestoreContext, ready: Ready, databaseFile: string) {
  const kept = await keepCurrentLibrary(context, ready.install);
  let isOpen: boolean;
  try {
    isOpen = await swapLibrary(ready, databaseFile, context.log);
  } catch (error) {
    await putBack(ready, kept, context.log);
    throw error;
  }
  if (!isOpen) {
    await putBack(ready, kept, context.log);
    throw new AppError('invalid-backup', unopenedMessage(kept));
  }
}

/**
 * Restores a backup sent as a zip. A zip that isn't a backup, or holds a library this version
 * can't open, is refused before anything changes.
 */
export async function restoreLibrary(
  context: RestoreContext,
  upload: NodeJS.ReadableStream,
): Promise<void> {
  const ready = requireRestorable(context);
  const files = makeRestoreFiles(ready.install.dataDir);
  try {
    await saveStream(upload, files.zipFile);
    await unpackBackup(files.zipFile, files.databaseFile);
    checkRestoredDatabase(files.databaseFile);
    await swapInRestored(context, ready, files.databaseFile);
  } finally {
    await files.discard();
  }
}
