// Walks a root folder by folder and says what each file or page folder is, without touching the
// database. The scanner compares what it finds with the items table.
import { classifyFile, isImageFileName, isSystemEntry } from '#core/archive/classify.js';
import { INBOX_FOLDER_NAME, listFolder } from '#core/archive/originals.js';
import { isPageFolder } from '#core/archive/pagefolder.js';

import type { FolderEntry } from '#core/archive/originals.js';
import type { ItemKind } from '#core/db/repositories/items.js';

/**
 * A file or page folder found under a root. Kind 'ignored' is a file of no known format, and
 * 'unreadable-folder' a subfolder the scan couldn't open, whose items must not be called missing.
 */
export type FoundEntry = {
  /** Relative to the root, with forward slashes. */
  readonly relPath: string;
  readonly kind: ItemKind | 'ignored' | 'unreadable-folder';
  readonly size: number;
  readonly mtimeMs: number;
};

/** Joins a folder path relative to the root and a name, with forward slashes. */
function joinRelPath(relDir: string, name: string): string {
  return relDir === '' ? name : `${relDir}/${name}`;
}

/**
 * Says whether a folder may count as a page folder. The root can't, and neither can the Inbox,
 * where screenshots pasted one at a time (1.png, 2.png) are separate pictures, not a book.
 */
function canBePageFolder(relDir: string): boolean {
  const topFolder = relDir.split('/')[0] ?? '';
  return relDir !== '' && topFolder.toLowerCase() !== INBOX_FOLDER_NAME.toLowerCase();
}

/** One page-folder item standing for all its pages: their total size and newest time. */
function pageFolderEntry(relDir: string, files: readonly FolderEntry[]): FoundEntry {
  let size = 0;
  let mtimeMs = 0;
  for (const file of files) {
    size += file.size;
    mtimeMs = Math.max(mtimeMs, file.mtimeMs);
  }
  return { relPath: relDir, kind: 'pagefolder', size, mtimeMs };
}

/**
 * What one folder holds: its own items, and the subfolders still to walk. A folder made a
 * publication by hand is one page folder of its pictures, however they are named; its subfolders
 * are still walked as usual.
 */
function readFolderEntries(
  relDir: string,
  entries: readonly FolderEntry[],
  isPublication: boolean,
): { found: FoundEntry[]; subfolders: string[] } {
  const files = entries.filter((entry) => !entry.isFolder);
  const subfolders = entries
    .filter((entry) => entry.isFolder)
    .map((entry) => joinRelPath(relDir, entry.name));
  const shape = { subfolderCount: subfolders.length, fileNames: files.map((file) => file.name) };
  const pictures = files.filter((file) => isImageFileName(file.name));
  if (canBePageFolder(relDir) && isPublication && pictures.length > 0) {
    return { found: [pageFolderEntry(relDir, pictures)], subfolders };
  }
  if (canBePageFolder(relDir) && isPageFolder(shape)) {
    return { found: [pageFolderEntry(relDir, files)], subfolders };
  }
  const found = files.map((file): FoundEntry => ({
    relPath: joinRelPath(relDir, file.name),
    kind: classifyFile(file.name) ?? 'ignored',
    size: file.size,
    mtimeMs: file.mtimeMs,
  }));
  return { found, subfolders };
}

/**
 * Where a walk starts and how deep it goes. A full scan walks the whole root; the watcher walks
 * one folder alone, or one folder and everything under it (docs/ARCHITECTURE.md, Watch).
 */
export type WalkOptions = {
  /** The folder to start in, relative to the root; the root itself when left out. */
  readonly startDir?: string;
  /** Lists only the start folder, leaving its subfolders to their own walks. */
  readonly isShallow?: boolean;
  /** Hears how many files each listed folder held, for the progress bar (E5). */
  readonly onFilesListed?: (fileCount: number) => void;
  /** Says whether a folder was made a publication by hand (publication_folders). */
  readonly isPublicationFolder?: (relDir: string) => boolean;
};

/**
 * Lists a folder, or returns undefined for a subfolder that can't be opened (no permission, or
 * removed since its parent was listed), so one bad folder doesn't stop the whole walk. The folder
 * a walk starts in must be readable: a walk of an unreadable start folder fails rather than
 * finding nothing, so its caller can tell a folder that is gone from one that is empty.
 */
async function listFolderIfReadable(
  rootPath: string,
  relDir: string,
  startDir: string,
): Promise<FolderEntry[] | undefined> {
  try {
    return await listFolder(rootPath, relDir);
  } catch (error) {
    if (relDir === startDir) {
      throw error;
    }
    return undefined;
  }
}

/**
 * Yields every file and page folder under a root, one folder at a time, so a large archive is
 * never held in memory at once. Folders are walked in name order, so scans are repeatable.
 * Each listed folder's file count, page folders' pages included, goes to `onFilesListed`, so
 * progress counts the same files as countFiles() in originals.ts (E5).
 */
export async function* walkRoot(
  rootPath: string,
  options: WalkOptions = {},
): AsyncGenerator<FoundEntry> {
  const startDir = options.startDir ?? '';
  // The watcher can start a walk inside a system folder (a change under .Trashes, say); nothing
  // there belongs to the archive.
  if (startDir.split('/').some((part) => part !== '' && isSystemEntry(part, true))) {
    return;
  }
  // A stack of folders still to read, so the walk goes depth first.
  const folders = [startDir];
  for (let relDir = folders.pop(); relDir !== undefined; relDir = folders.pop()) {
    const listed = await listFolderIfReadable(rootPath, relDir, startDir);
    if (listed === undefined) {
      yield { relPath: relDir, kind: 'unreadable-folder', size: 0, mtimeMs: 0 };
      continue;
    }
    // System clutter is skipped before anything else, so it neither shows up as an item nor stops
    // a folder of page scans from being a page folder.
    const entries = listed.filter((entry) => !isSystemEntry(entry.name, entry.isFolder));
    entries.sort((left, right) => left.name.localeCompare(right.name));
    options.onFilesListed?.(entries.filter((entry) => !entry.isFolder).length);
    const isPublication = options.isPublicationFolder?.(relDir) ?? false;
    const { found, subfolders } = readFolderEntries(relDir, entries, isPublication);
    yield* found;
    if (options.isShallow !== true) {
      folders.push(...subfolders.reverse());
    }
  }
}
