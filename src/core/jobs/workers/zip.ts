// Reads the pages of a CBZ (a zip of page scans) with yauzl, from a file opened read-only.
import { buffer } from 'node:stream/consumers';

import yauzl from 'yauzl';

import { isImageFileName } from '#core/archive/classify.js';
import { sortPageNames } from '#core/archive/pagefolder.js';
import { AppError } from '#core/errors.js';

/** The page images of a CBZ in reading order, and the bytes of the first. */
export type ZipPages = {
  readonly pageCount: number;
  readonly firstPage: Buffer;
};

/** Says whether a zip entry is a page: an image file, not a folder or macOS resource fork. */
function isPageEntry(fileName: string): boolean {
  return !fileName.endsWith('/') && !fileName.startsWith('__MACOSX/') && isImageFileName(fileName);
}

/** A CBZ's page entries in reading order, read from a file opened read-only. */
async function listZipPages(fd: number) {
  // No zip.close(): it closes the descriptor, which belongs to the caller.
  const zip = await yauzl.fromFdPromise(fd, { lazyEntries: true, autoClose: false });
  const entries = new Map<string, yauzl.Entry>();
  for await (const entry of zip.eachEntry()) {
    if (isPageEntry(entry.fileName)) {
      entries.set(entry.fileName, entry);
    }
  }
  const pages = sortPageNames([...entries.keys()]).map((name) => entries.get(name));
  return { zip, pages: pages.filter((entry) => entry !== undefined) };
}

/** Reads page n of a CBZ, counting from 1, with its name inside the zip. */
export async function readZipPage(
  fd: number,
  pageNumber: number,
): Promise<{ fileName: string; bytes: Buffer }> {
  const { zip, pages } = await listZipPages(fd);
  const page = pages[pageNumber - 1];
  if (page === undefined) {
    throw new AppError('not-found', `The CBZ has no page ${String(pageNumber)}.`);
  }
  return { fileName: page.fileName, bytes: await buffer(await zip.openReadStreamPromise(page)) };
}

/**
 * Counts a CBZ's pages and reads the first in name order. The caller owns the file descriptor
 * and closes it.
 */
export async function readZipPages(fd: number): Promise<ZipPages> {
  const { zip, pages } = await listZipPages(fd);
  const [first] = pages;
  if (first === undefined) {
    throw new AppError('media-unreadable', 'The CBZ holds no page images.');
  }
  const firstPage = await buffer(await zip.openReadStreamPromise(first));
  return { pageCount: pages.length, firstPage };
}
