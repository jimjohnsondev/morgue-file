// Making a folder of photos one publication by hand, and turning it back (PRD R5, R21). For
// scans the page-folder rule can't recognize, such as "Issue_b 19.jpg", since a folder of
// numbered photos from a session (IMG_0001.jpg…) looks the same to it.
import { INBOX_FOLDER_NAME } from '#core/archive/originals.js';
import { findUnattachedItemIds, removeItems } from '#core/db/repositories/item-files.js';
import {
  clearHandFiling,
  fileItemsByHand,
  findItemById,
  findItemByPath,
} from '#core/db/repositories/items.js';
import {
  deletePublicationFolder,
  insertPublicationFolder,
  isPublicationFolder,
} from '#core/db/repositories/publication-folders.js';
import { findRootById } from '#core/db/repositories/roots.js';
import { findSubcategoryById } from '#core/db/repositories/subcategories.js';
import { AppError } from '#core/errors.js';
import { foldPathCase } from '#core/indexer/reconcile.js';
import { parentFolder, scanFolder } from '#core/indexer/scanner.js';

import { selectedItemIds } from './bulk-changes.js';

import type { Db } from '#core/db/connection.js';
import type { Item } from '#core/db/repositories/items.js';
import type { Selection } from './bulk-changes.js';

/** A folder of one root. */
type Folder = { readonly rootId: number; readonly relPath: string };

/** What making a publication did: how many photos were chosen, and the publication made. */
export type PublicationResult = {
  readonly itemCount: number;
  readonly publicationId: number;
};

/** The photos of a selection, refusing anything else: only a photo's folder can become one. */
function requirePhotos(db: Db, selection: Selection): Item[] {
  const items = selectedItemIds(db, selection).map((id) => findItemById(db, id));
  const photos = items.filter((item): item is Item => item?.kind === 'image');
  if (photos.length === 0 || photos.length !== items.length) {
    throw new AppError(
      'invalid-input',
      'Only photos can be made into a publication: select scanned pages from one folder.',
    );
  }
  return photos;
}

/**
 * The one folder the photos sit in, refusing the Reference folder itself, the Inbox, and photos
 * from more than one folder: one action makes one publication, and is undone as one.
 */
function photoFolder(photos: readonly Item[]): Folder {
  const folders = new Map<string, Folder>();
  for (const photo of photos) {
    const relPath = parentFolder(photo.relPath);
    folders.set(`${String(photo.rootId)}:${foldPathCase(relPath)}`, {
      rootId: photo.rootId,
      relPath,
    });
  }
  const [folder, ...others] = folders.values();
  if (folder === undefined || others.length > 0) {
    throw new AppError(
      'invalid-input',
      `The selected scans are in ${String(folders.size)} folders. Select scans from one folder at a time.`,
    );
  }
  const topFolder = folder.relPath.split('/')[0] ?? '';
  if (folder.relPath === '' || foldPathCase(topFolder) === foldPathCase(INBOX_FOLDER_NAME)) {
    throw new AppError(
      'invalid-input',
      'Scans directly in the Reference folder or in the Inbox can’t be a publication. Move them into a folder of their own first.',
    );
  }
  return folder;
}

/** The path of a root, refusing one that isn't online, since its folder has to be read. */
function onlineRootPath(db: Db, rootId: number): string {
  const root = findRootById(db, rootId);
  if (root?.status !== 'online') {
    throw new AppError(
      'invalid-input',
      'The Reference folder is offline, so its folders can’t be read.',
    );
  }
  return root.path;
}

/** Scans one folder, and the files directly in it, so a change shows at once. */
async function rescanFolder(db: Db, folder: Folder, now: Date): Promise<void> {
  const rootPath = onlineRootPath(db, folder.rootId);
  await scanFolder(
    { db, rootId: folder.rootId, rootPath, now: () => now },
    { relDir: folder.relPath, isShallow: true },
  );
}

/**
 * Makes the folder of the selected photos one publication, filed in a Library subcategory. Its
 * photos are then that publication's pages: those with nothing attached go, and any with tags,
 * notes or other links stay as missing items, as the scanner does for any page folder. Anything
 * else in the folder (a video, a PDF) stays its own item.
 */
export async function makeFolderPublication(
  db: Db,
  request: { readonly selection: Selection; readonly subcategoryId: number; readonly now: Date },
): Promise<PublicationResult> {
  const subcategory = findSubcategoryById(db, request.subcategoryId);
  if (subcategory?.section !== 'library') {
    throw new AppError('invalid-input', 'A publication goes in a Library subcategory.');
  }
  const photos = requirePhotos(db, request.selection);
  const folder = photoFolder(photos);
  onlineRootPath(db, folder.rootId);
  insertPublicationFolder(db, { ...folder, now: request.now.toISOString() });
  await rescanFolder(db, folder, request.now);
  const publication = findItemByPath(db, folder.rootId, folder.relPath);
  if (publication?.kind !== 'pagefolder') {
    // The folder couldn't be read just now; forget it rather than change it on a later scan.
    deletePublicationFolder(db, folder.rootId, folder.relPath);
    throw new AppError(
      'invalid-input',
      'That folder couldn’t be read just now, so nothing changed.',
    );
  }
  fileItemsByHand(db, [publication.id], subcategory.id);
  return { itemCount: photos.length, publicationId: publication.id };
}

/**
 * Turns a publication made by hand back into a folder of photos. The publication goes too, unless
 * something is attached to it (tags, notes, models), in which case it stays as a missing item.
 * Returns the folder's path, for a link to its photos.
 */
export async function unmakeFolderPublication(db: Db, itemId: number, now: Date): Promise<string> {
  const item = findItemById(db, itemId);
  if (item?.kind !== 'pagefolder' || !isPublicationFolder(db, item.rootId, item.relPath)) {
    throw new AppError(
      'invalid-input',
      'Only a folder made into a publication can be turned back.',
    );
  }
  const folder = { rootId: item.rootId, relPath: item.relPath };
  onlineRootPath(db, folder.rootId);
  deletePublicationFolder(db, folder.rootId, folder.relPath);
  await rescanFolder(db, folder, now);
  // Making the publication filed it by hand; that alone shouldn't keep it as a missing item. If
  // something else keeps it, it keeps its filing too.
  clearHandFiling(db, item.id);
  if (findUnattachedItemIds(db, [item.id]).length > 0) {
    removeItems(db, [item.id]);
  } else if (item.isFiledByHand) {
    fileItemsByHand(db, [item.id], item.subcategoryId);
  }
  return folder.relPath;
}
