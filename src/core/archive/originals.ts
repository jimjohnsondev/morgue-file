// The only module that touches files under a Reference root: it reads, and creates the Inbox.
import { existsSync } from 'node:fs';
import { mkdir, open, opendir, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { AppError, systemErrorCode } from '#core/errors.js';

/** The folder inside the Reference folder where dropped and pasted files are saved (R2). */
export const INBOX_FOLDER_NAME = 'Inbox';

/** The Reference folder setup suggests, from the PRD: the secondary drive's root. */
const SUGGESTED_REFERENCE_FOLDER = 'E:\\Reference';

/** One entry of a folder under a root, with what the scanner compares between scans. */
export type FolderEntry = {
  readonly name: string;
  readonly isFolder: boolean;
  /** Bytes, and last-modified time in ms since the epoch; 0 for folders. */
  readonly size: number;
  readonly mtimeMs: number;
};

/** A file under a root opened read-only, for readers such as yauzl that take a descriptor. */
export type OpenOriginal = {
  readonly fd: number;
  readonly close: () => Promise<void>;
};

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

/**
 * Joins a root and a path relative to it, refusing any path that would leave the root (`..`, an
 * absolute path, another drive), so a bad row in the database can never reach other files.
 */
export function resolveOriginalPath(rootPath: string, relPath: string): string {
  const root = path.resolve(rootPath);
  const resolved = path.resolve(root, relPath);
  const relative = path.relative(root, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new AppError('invalid-input', `${relPath} is outside the Reference folder.`);
  }
  return resolved;
}

/**
 * Lists a folder under a root: its subfolders, and its files with size and time. Other entries
 * (links, devices) are left out, so a link can't lead a scan outside the root or round in a loop.
 */
export async function listFolder(rootPath: string, relDir: string): Promise<FolderEntry[]> {
  const folder = resolveOriginalPath(rootPath, relDir);
  const entries: FolderEntry[] = [];
  for await (const entry of await opendir(folder)) {
    if (entry.isDirectory()) {
      entries.push({ name: entry.name, isFolder: true, size: 0, mtimeMs: 0 });
    } else if (entry.isFile()) {
      const details = await stat(path.join(folder, entry.name));
      entries.push({
        name: entry.name,
        isFolder: false,
        size: details.size,
        mtimeMs: Math.trunc(details.mtimeMs),
      });
    }
  }
  return entries;
}

/** Reads a whole file under a root, read-only. */
export async function readOriginal(rootPath: string, relPath: string): Promise<Buffer> {
  return readFile(resolveOriginalPath(rootPath, relPath), { flag: 'r' });
}

/** Opens a file under a root read-only, for a reader that seeks within it (CBZ). */
export async function openOriginal(rootPath: string, relPath: string): Promise<OpenOriginal> {
  const handle = await open(resolveOriginalPath(rootPath, relPath), 'r');
  return { fd: handle.fd, close: async () => handle.close() };
}
