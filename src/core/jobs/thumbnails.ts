// Runs a thumbnail job: reads the item's original through originals.ts, makes its default
// thumbnail with the worker for its kind, saves it to the cache and stores its media details.
import { readOriginal, resolveOriginalPath } from '#core/archive/originals.js';
import { setItemMediaDetails, setThumbState } from '#core/db/repositories/item-files.js';
import { findItemById } from '#core/db/repositories/items.js';
import { findRootById } from '#core/db/repositories/roots.js';
import { AppError } from '#core/errors.js';

import { defaultThumbnailSize, saveThumbnail, thumbnailPath } from './thumbnail-files.js';
import { makeImageThumbnail } from './workers/thumb-image.js';
import { makeCbzThumbnail, makePageFolderThumbnail } from './workers/thumb-pages.js';
import { makePdfThumbnail } from './workers/thumb-pdf.js';
import { makeVideoThumbnail } from './workers/thumb-video.js';

import type { Db } from '#core/db/connection.js';
import type { Item, ItemKind } from '#core/db/repositories/items.js';
import type { Job } from '#core/db/repositories/jobs.js';
import type { Root } from '#core/db/repositories/roots.js';
import type { ThumbnailSize } from './thumbnail-files.js';
import type { ThumbnailResult } from './workers/crop.js';
import type { MediaTools } from './workers/media-tools.js';
import type { OriginalRef } from './workers/original-ref.js';

/** What thumbnail jobs need: the library, the cache folder and the video tools, if found. */
export type ThumbnailContext = {
  readonly db: Db;
  readonly thumbsDir: string;
  readonly mediaTools: MediaTools | undefined;
};

/** What one worker call needs. */
type WorkerInput = {
  readonly kind: ItemKind;
  readonly original: OriginalRef;
  readonly size: ThumbnailSize;
  readonly mediaTools: MediaTools | undefined;
};

/** Sends an item to the worker for its kind. */
async function makeThumbnail(input: WorkerInput): Promise<ThumbnailResult> {
  const { original, size } = input;
  switch (input.kind) {
    case 'image':
      return makeImageThumbnail(await readOriginal(original.rootPath, original.relPath), size);
    case 'pdf':
      return makePdfThumbnail(await readOriginal(original.rootPath, original.relPath), size);
    case 'cbz':
      return makeCbzThumbnail(original, size);
    case 'pagefolder':
      return makePageFolderThumbnail(original, size);
    case 'video': {
      if (input.mediaTools === undefined) {
        throw new AppError(
          'media-unreadable',
          'ffmpeg and ffprobe were not found, so video thumbnails cannot be made.',
        );
      }
      // ffmpeg opens the file itself; originals.ts still checks the path stays in the root.
      const file = resolveOriginalPath(original.rootPath, original.relPath);
      return makeVideoThumbnail(input.mediaTools, file, size);
    }
  }
}

/** Reads an item and its root, failing if either has gone. */
function requireItemAndRoot(db: Db, itemId: number): { item: Item; root: Root } {
  const item = findItemById(db, itemId);
  const root = item === undefined ? undefined : findRootById(db, item.rootId);
  if (item === undefined || root === undefined) {
    throw new AppError('not-found', `Item ${String(itemId)} or its root no longer exists.`);
  }
  return { item, root };
}

/** Makes one item's thumbnail at one size and saves it to the cache. */
async function makeAndSave(
  context: ThumbnailContext,
  itemId: number,
  size: ThumbnailSize,
): Promise<ThumbnailResult> {
  const { item, root } = requireItemAndRoot(context.db, itemId);
  const result = await makeThumbnail({
    kind: item.kind,
    original: { rootPath: root.path, relPath: item.relPath },
    size,
    mediaTools: context.mediaTools,
  });
  await saveThumbnail(thumbnailPath(context.thumbsDir, item.id, size), result.webp);
  return result;
}

/** Makes and saves the default thumbnail for a job's item, and stores its media details. */
export async function runThumbnailJob(context: ThumbnailContext, job: Job): Promise<void> {
  const item = findItemById(context.db, job.itemId);
  const size = defaultThumbnailSize(item?.kind ?? 'image');
  const result = await makeAndSave(context, job.itemId, size);
  setItemMediaDetails(context.db, job.itemId, result.details);
}

/**
 * Makes a size other than the default the first time a page asks for it (Small and Large
 * squares), from the original, so it is as sharp as the default. Returns the cache file.
 */
export async function makeThumbnailAtSize(
  context: ThumbnailContext,
  itemId: number,
  size: ThumbnailSize,
): Promise<string> {
  await makeAndSave(context, itemId, size);
  return thumbnailPath(context.thumbsDir, itemId, size);
}

/** Records that an item's thumbnail couldn't be made, so the item page can show it instead of waiting. */
export function markThumbnailFailed(db: Db, job: Job): void {
  setThumbState(db, job.itemId, 'failed');
}
