// Covers for CBZ files and page folders: the first page, in reading order.
import { openOriginal, readOriginal } from '#core/archive/originals.js';
import { listFolderPages } from '#core/archive/publication-pages.js';
import { AppError } from '#core/errors.js';

import { cropToThumbnail } from './crop.js';
import { readZipPages } from './zip.js';

import type { ThumbnailResult } from './crop.js';
import type { OriginalRef } from './original-ref.js';
import type { ThumbnailSize } from '../thumbnail-files.js';

/** Makes a CBZ's cover from its first page and counts its pages. */
export async function makeCbzThumbnail(
  original: OriginalRef,
  size: ThumbnailSize,
): Promise<ThumbnailResult> {
  const file = await openOriginal(original.rootPath, original.relPath);
  try {
    const pages = await readZipPages(file.fd);
    return {
      webp: await cropToThumbnail(pages.firstPage, size),
      details: { pageCount: pages.pageCount },
    };
  } finally {
    await file.close();
  }
}

/** Makes a page folder's cover from its first page and counts its pages. */
export async function makePageFolderThumbnail(
  original: OriginalRef,
  size: ThumbnailSize,
): Promise<ThumbnailResult> {
  const pages = await listFolderPages(original.rootPath, original.relPath);
  const firstPage = pages[0];
  if (firstPage === undefined) {
    throw new AppError('media-unreadable', 'The page folder holds no pages.');
  }
  const picture = await readOriginal(original.rootPath, `${original.relPath}/${firstPage}`);
  return {
    webp: await cropToThumbnail(picture, size),
    details: { pageCount: pages.length },
  };
}
