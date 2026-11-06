// The only module that touches files under a Reference root: it reads and watches them, and
// creates the Inbox and writes dropped files into it.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, watch } from 'node:fs';
import { lstat, mkdir, open, opendir, readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { AppError, systemErrorCode } from '#core/errors.js';

import type { Stats } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import type { Readable } from 'node:stream';

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

/** Counts one folder's files and adds its subfolders to the list still to count. */
async function countFolder(folder: string, subfolders: string[]): Promise<number> {
  let count = 0;
  try {
    for await (const entry of await opendir(folder)) {
      if (entry.isDirectory()) {
        subfolders.push(path.join(folder, entry.name));
      } else if (entry.isFile()) {
        count += 1;
      }
    }
  } catch {
    // An unreadable or vanished subfolder only makes the estimate smaller; the scan reports it.
  }
  return count;
}

/**
 * Counts the files under a root, following the same rules as listFolder (links and devices left
 * out), without reading each file's details, so a first index can say "12,400 of 48,000" (E5).
 * A subfolder that can't be read counts as empty; the scan skips it too.
 */
export async function countFiles(rootPath: string, signal?: AbortSignal): Promise<number> {
  const folders = [resolveOriginalPath(rootPath, '')];
  let count = 0;
  for (let folder = folders.pop(); folder !== undefined; folder = folders.pop()) {
    signal?.throwIfAborted();
    count += await countFolder(folder, folders);
  }
  return count;
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

/** A file's size and time, for serving it with Range support. */
export type OriginalFileInfo = {
  readonly size: number;
  readonly mtimeMs: number;
};

/** Bytes start to end of a file, both inclusive, as HTTP ranges count them. */
export type ByteRange = {
  readonly start: number;
  readonly end: number;
};

/**
 * Reads the size and time of a file under a root. A file that is gone, or on a drive that is
 * offline, is refused as not found, so the viewer can say it can't be opened right now.
 */
export async function statOriginal(rootPath: string, relPath: string): Promise<OriginalFileInfo> {
  const file = resolveOriginalPath(rootPath, relPath);
  let details: Stats;
  try {
    details = await stat(file);
  } catch {
    throw new AppError('not-found', `${relPath} can't be opened right now.`);
  }
  if (!details.isFile()) {
    throw new AppError('not-found', `${relPath} is not a file.`);
  }
  return { size: details.size, mtimeMs: Math.trunc(details.mtimeMs) };
}

/** Streams a file under a root, or part of it, read-only, for the viewers (R19). */
export function streamOriginal(rootPath: string, relPath: string, range?: ByteRange): Readable {
  return createReadStream(resolveOriginalPath(rootPath, relPath), { flags: 'r', ...range });
}

/** How much of each of a file's start, middle and end its partial hash reads. */
const PARTIAL_HASH_CHUNK_BYTES = 64 * 1024;

/** Where the three chunks of a partial hash start; they overlap, or repeat, in a small file. */
function partialHashOffsets(size: number): number[] {
  const middle = Math.floor(size / 2) - PARTIAL_HASH_CHUNK_BYTES / 2;
  return [0, Math.max(0, middle), Math.max(0, size - PARTIAL_HASH_CHUNK_BYTES)];
}

/**
 * Hashes a file's size and its first, middle and last 64 KiB with SHA-256: enough to tell a moved
 * file from a different one of the same size without reading all of it (docs/ARCHITECTURE.md,
 * Moves).
 */
export async function readPartialHash(rootPath: string, relPath: string): Promise<string> {
  const handle = await open(resolveOriginalPath(rootPath, relPath), 'r');
  try {
    const { size } = await handle.stat();
    const hash = createHash('sha256').update(`${String(size)}:`);
    for (const offset of partialHashOffsets(size)) {
      const chunk = Buffer.alloc(Math.min(PARTIAL_HASH_CHUNK_BYTES, size - offset));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, offset);
      hash.update(chunk.subarray(0, bytesRead));
    }
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}

/** What is at a path under a root now. Links and devices count as nothing, as in listFolder. */
export type EntryKind = 'file' | 'folder' | 'none';

/** Says what is at a path under a root now, for the watcher to choose what to scan. */
export async function findEntryKind(rootPath: string, relPath: string): Promise<EntryKind> {
  try {
    const details = await lstat(resolveOriginalPath(rootPath, relPath));
    if (details.isFile()) {
      return 'file';
    }
    return details.isDirectory() ? 'folder' : 'none';
  } catch {
    // Gone, or unreachable: either way there is nothing to read there now.
    return 'none';
  }
}

/** Who hears about changes under a watched root. */
export type WatchListener = {
  /**
   * Told the path, relative to the root, of each file or folder that was added, changed,
   * renamed or removed; undefined when the system lost count and anything may have changed.
   */
  readonly onChange: (relPath: string | undefined) => void;
  readonly onError: (error: unknown) => void;
};

/** A running watch on a root. */
export type OriginalsWatch = {
  readonly close: () => void;
};

/**
 * Watches a root and everything under it for changes (R1). On Windows this is one handle on the
 * root, so folders inside it can still be renamed and moved while the app runs.
 */
export function watchOriginals(rootPath: string, listener: WatchListener): OriginalsWatch {
  const watcher = watch(
    resolveOriginalPath(rootPath, ''),
    { recursive: true },
    (_event, filename) => {
      listener.onChange(filename === null ? undefined : filename.split(path.sep).join('/'));
    },
  );
  watcher.on('error', listener.onError);
  return {
    close: () => {
      watcher.close();
    },
  };
}

/** A file to save in the Inbox: the month folder, the cleaned name and the bytes. */
export type InboxFile = {
  /** The folder inside the Inbox, such as `2026-11`; one name, never a path. */
  readonly folderName: string;
  /** A name already cleaned for Windows (core/ingest/file-names.ts); one name, never a path. */
  readonly fileName: string;
  readonly content: Readable;
};

/** Refuses a folder or file name that is a path, so a write can't leave its Inbox folder. */
function requireSingleName(name: string): void {
  // Both slashes are checked, since path.basename only splits on the running system's own.
  const isPath = name.includes('/') || name.includes('\\');
  if (isPath || name === '' || name === '.' || name === '..') {
    throw new AppError('invalid-input', `${name} is not a plain file name.`);
  }
}

/** Returns `name (n).ext`, the name a file is saved under when `name.ext` is taken. */
function numberedName(fileName: string, number: number): string {
  if (number === 1) {
    return fileName;
  }
  const extension = path.extname(fileName);
  return `${fileName.slice(0, fileName.length - extension.length)} (${String(number)})${extension}`;
}

/** Creates a new file for writing, or returns undefined if the name was taken meanwhile. */
async function createNewFile(file: string): Promise<FileHandle | undefined> {
  try {
    return await open(file, 'wx');
  } catch (error) {
    if (systemErrorCode(error) === 'EEXIST') {
      return undefined;
    }
    throw error;
  }
}

/**
 * Creates the file under the first free name: `name.ext`, then `name (2).ext` and so on. Names
 * are compared ignoring case, as Windows and the database do, and the file is opened with `wx`,
 * so another write that takes the name first is never overwritten.
 */
async function createFreeFile(folder: string, fileName: string): Promise<[string, FileHandle]> {
  const taken = new Set((await readdir(folder)).map((name) => name.toLowerCase()));
  for (let number = 1; ; number += 1) {
    const candidate = numberedName(fileName, number);
    const handle = taken.has(candidate.toLowerCase())
      ? undefined
      : await createNewFile(path.join(folder, candidate));
    if (handle !== undefined) {
      return [candidate, handle];
    }
  }
}

/**
 * Saves a dropped, pasted or fetched file in `Inbox/<folder>/` (R2), the one place the app writes
 * inside a Reference root. A name that is taken gets " (2)" and so on; nothing is overwritten. A
 * file whose content fails part way is removed, so no half-written file is left behind. Returns
 * the new file's path relative to the root.
 */
export async function writeInbox(referenceFolder: string, file: InboxFile): Promise<string> {
  requireSingleName(file.folderName);
  requireSingleName(file.fileName);
  const relDir = `${INBOX_FOLDER_NAME}/${file.folderName}`;
  const folder = resolveOriginalPath(referenceFolder, relDir);
  await mkdir(folder, { recursive: true });
  const [name, handle] = await createFreeFile(folder, file.fileName);
  try {
    await pipeline(file.content, handle.createWriteStream());
  } catch (error) {
    await handle.close();
    await rm(path.join(folder, name), { force: true });
    throw error;
  }
  return `${relDir}/${name}`;
}
