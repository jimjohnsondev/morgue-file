// Covers for CBZ files and page folders (the first page, in reading order), and the small
// pictures of their pages in the reader's strip (R21).
import { openOriginal, readOriginal } from '#core/archive/originals.js';
import { listFolderPages, readPublicationPage } from '#core/archive/publication-pages.js';
import { AppError } from '#core/errors.js';

import { PAGE_STRIP_SIZE } from '../thumbnail-files.js';

import { cropToThumbnail } from './crop.js';
import { readZipPages } from './zip.js';

import type { PagedOriginal } from '#core/archive/publication-pages.js';
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

/**
 * Makes the strip's small picture of page n of a CBZ or page folder, so a long book's strip
 * doesn't load every full-size scan (R21). Fails as not found if there's no such page, and as
 * unreadable if the page isn't a picture sharp can read.
 */
export async function makePageStripPicture(
  original: PagedOriginal,
  pageNumber: number,
): Promise<Buffer> {
  const page = await readPublicationPage(original, pageNumber);
  try {
    return await cropToThumbnail(page.bytes, PAGE_STRIP_SIZE);
  } catch {
    throw new AppError('media-unreadable', `Page ${String(pageNumber)} isn't a readable picture.`);
  }
}
