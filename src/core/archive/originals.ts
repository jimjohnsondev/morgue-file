// The only module that touches files under a Reference root: it reads, and creates the Inbox.
import { existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
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

/** Creates the Inbox folder inside the Reference folder. Existing files are left alone. */
export async function createInbox(referenceFolder: string): Promise<void> {
  await mkdir(path.join(referenceFolder, INBOX_FOLDER_NAME), { recursive: true });
}

/** Returns E:\Reference when this is Windows and that folder exists, for setup to pre-fill. */
export function findSuggestedReferenceFolder(): string | undefined {
  if (process.platform !== 'win32' || !existsSync(SUGGESTED_REFERENCE_FOLDER)) {
    return undefined;
  }
  return SUGGESTED_REFERENCE_FOLDER;
}
