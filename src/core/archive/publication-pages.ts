// Reads one page of a CBZ or a page folder for the page reader (R21). PDFs are drawn in the
// browser by pdf.js instead, so they never come through here.
import { AppError } from '#core/errors.js';
import { readZipPage } from '#core/jobs/workers/zip.js';

import { listFolder, openOriginal, readOriginal } from './originals.js';
import { isPageFileName, sortPageNames } from './pagefolder.js';

/** A publication whose pages are pictures: a zip of them, or a folder of them. */
export type PagedOriginal = {
  readonly kind: 'cbz' | 'pagefolder';
  readonly rootPath: string;
  readonly relPath: string;
};

/** One page's picture, and its file name, which gives its type. */
export type PagePicture = {
  readonly fileName: string;
  readonly bytes: Buffer;
};

/** The file names of a page folder's pages, in reading order. */
export async function listFolderPages(rootPath: string, relPath: string): Promise<string[]> {
  const entries = await listFolder(rootPath, relPath);
  return sortPageNames(
    entries
      .filter((entry) => !entry.isFolder && isPageFileName(entry.name))
      .map((entry) => entry.name),
  );
}

/** Reads page n of a page folder, counting from 1. */
async function readFolderPage(original: PagedOriginal, pageNumber: number): Promise<PagePicture> {
  const pages = await listFolderPages(original.rootPath, original.relPath);
  const fileName = pages[pageNumber - 1];
  if (fileName === undefined) {
    throw new AppError('not-found', `There is no page ${String(pageNumber)}.`);
  }
  const bytes = await readOriginal(original.rootPath, `${original.relPath}/${fileName}`);
  return { fileName, bytes };
}

/** Reads page n, counting from 1, of a CBZ or page folder. */
export async function readPublicationPage(
  original: PagedOriginal,
  pageNumber: number,
): Promise<PagePicture> {
  if (original.kind === 'pagefolder') {
    return readFolderPage(original, pageNumber);
  }
  const file = await openOriginal(original.rootPath, original.relPath);
  try {
    return await readZipPage(file.fd, pageNumber);
  } finally {
    await file.close();
  }
}
