// Turns a decoded picture (a photo, a video frame, a page) into a WebP thumbnail.
import sharp from 'sharp';

import type { MediaDetails } from '#core/db/repositories/item-files.js';
import type { ThumbnailSize } from '../thumbnail-files.js';

/** A finished thumbnail and what the worker learned about the item on the way. */
export type ThumbnailResult = {
  readonly webp: Buffer;
  readonly details: MediaDetails;
};

/**
 * Crops a picture to a thumbnail. Squares follow sharp's attention point, so a figure isn't cut
 * off at the head; covers keep the middle, where a page's layout is balanced.
 */
export async function cropToThumbnail(picture: Buffer, size: ThumbnailSize): Promise<Buffer> {
  const isSquare = size.width === size.height;
  return sharp(picture)
    .autoOrient()
    .resize(size.width, size.height, { fit: 'cover', position: isSquare ? 'attention' : 'centre' })
    .webp({ quality: 82 })
    .toBuffer();
}
