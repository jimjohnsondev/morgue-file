// Builds the compare board's page (R22) from the board kept in settings: each reference's
// picture at the largest size the app has for it, in the order they were added.
import { COMPARE_BOARD_LIMIT, readCompareBoard } from '#core/compare/compare-board.js';
import { findItemById } from '#core/db/repositories/items.js';
import { findRootById } from '#core/db/repositories/roots.js';
import { defaultThumbnailSize, sizeToLabel } from '#core/jobs/thumbnail-files.js';

import { itemLabel } from '../../views/format.js';

import { photoSource } from './item-viewers.js';

import type { Db } from '#core/db/connection.js';
import type { Item } from '#core/db/repositories/items.js';
import type { CompareModel, ComparePicture } from '../../views/templates/compare-template.js';

/** Why an item's original can't be shown, or undefined if it can. */
function unavailableNote(db: Db, item: Item): string | undefined {
  const root = findRootById(db, item.rootId);
  if (root === undefined || root.status === 'offline') {
    return 'original offline';
  }
  return item.missingSince === undefined ? undefined : 'original missing';
}

/** The item's cached thumbnail, the one picture the app has while its original can't be read. */
function thumbnailSrc(item: Item): string {
  const size = sizeToLabel(defaultThumbnailSize(item.kind));
  return `/media/thumb/${String(item.id)}/${size}?v=${String(item.mtimeMs)}`;
}

/**
 * What a reference shows: a photo or video from its original, a Library item's cover (page 1 for
 * a CBZ or page folder, the cover thumbnail for a PDF), or the thumbnail if the original is gone.
 */
function pictureFor(db: Db, item: Item): ComparePicture {
  const alt = itemLabel(item);
  const note = unavailableNote(db, item);
  if (note !== undefined) {
    return { kind: 'thumbnail', src: thumbnailSrc(item), alt, note };
  }
  switch (item.kind) {
    case 'image':
      return { kind: 'image', src: photoSource(item), alt };
    case 'video':
      return { kind: 'video', src: `/media/original/${String(item.id)}` };
    case 'pdf':
      return { kind: 'image', src: thumbnailSrc(item), alt };
    default:
      return { kind: 'image', src: `/media/page/${String(item.id)}/1`, alt };
  }
}

/** The compare board's page: its references, its layout, its size limit and its window's place. */
export function buildCompareModel(db: Db): CompareModel {
  const board = readCompareBoard(db);
  const items = board.itemIds
    .map((id) => findItemById(db, id))
    .filter((item) => item !== undefined);
  return {
    layout: board.layout,
    limit: COMPARE_BOARD_LIMIT,
    window: board.window,
    slots: items.map((item) => ({
      itemId: item.id,
      label: itemLabel(item),
      picture: pictureFor(db, item),
      removeAction: `/api/compare/items/${String(item.id)}`,
    })),
  };
}
