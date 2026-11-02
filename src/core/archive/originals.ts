// The only module that touches files under a Reference root: it reads, and creates the Inbox.
import { existsSync } from 'node:fs';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { AppError, systemErrorCode } from '#core/errors.js';

/** The folder inside the Reference folder where dropped and pasted files are saved (R2). */
export const INBOX_FOLDER_NAME = 'Inbox';

/** The Reference folder setup suggests, from the PRD: the secondary drive's root. */
const SUGGESTED_REFERENCE_FOLDER = 'E:\\Reference';

/** What setup's Check reports about a Reference folder. */
export type ReferenceFolderSummary = {
  readonly topLevelFileCount: number;
};

/** Turns a failed read of a Reference folder into a refusal the setup page can show as is. */
function refusalForUnreadableFolder(error: unknown, folder: string): AppError {
  const code = systemErrorCode(error);
  if (code === 'ENOENT') {
    return new AppError('folder-missing', `There is no folder at ${folder}.`);
  }
  if (code === 'ENOTDIR') {
    return new AppError('folder-missing', `${folder} is a file, not a folder.`);
  }
  return new AppError(
    'folder-unreadable',
    `Morgue File can't read ${folder}. Check that your Windows account can open it.`,
  );
}

/**
 * Confirms a Reference folder exists and can be read, and counts the files directly inside it,
 * so setup can show the user they picked the folder they meant (R30).
 */
export async function inspectReferenceFolder(folder: string): Promise<ReferenceFolderSummary> {
  try {
    const entries = await readdir(folder, { withFileTypes: true });
    return { topLevelFileCount: entries.filter((entry) => entry.isFile()).length };
  } catch (error) {
    throw refusalForUnreadableFolder(error, folder);
  }
}

/**
 * Creates the Inbox folder inside the Reference folder. Existing files are left alone. A
 * read-only drive is refused in plain words rather than failing as an internal error.
 */
export async function createInbox(referenceFolder: string): Promise<void> {
  try {
    await mkdir(path.join(referenceFolder, INBOX_FOLDER_NAME), { recursive: true });
  } catch {
    throw new AppError(
      'folder-unwritable',
      `Morgue File can't create an Inbox folder in ${referenceFolder}, where dropped files go. ` +
        "Check that the drive isn't read-only.",
    );
  }
}

/** Says whether a Reference folder is there now, to choose between its saved paths. */
export async function isReferenceFolderPresent(folder: string): Promise<boolean> {
  try {
    return (await stat(folder)).isDirectory();
  } catch {
    // Missing, or on a drive that is offline: either way, not usable now.
    return false;
  }
}

/** Returns E:\Reference when this is Windows and that folder exists, for setup to pre-fill. */
export function findSuggestedReferenceFolder(): string | undefined {
  if (process.platform !== 'win32' || !existsSync(SUGGESTED_REFERENCE_FOLDER)) {
    return undefined;
  }
  return SUGGESTED_REFERENCE_FOLDER;
}
