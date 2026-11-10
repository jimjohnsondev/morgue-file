// Thumbnails for photos: JPG, PNG, WebP and GIF (the first frame).
import sharp from 'sharp';

import { cropToThumbnail } from './crop.js';

import type { ThumbnailSize } from '../thumbnail-files.js';
import type { ThumbnailResult } from './crop.js';

/** Makes a photo's thumbnail and reads its size as it is shown, after EXIF rotation. */
export async function makeImageThumbnail(
  image: Buffer,
  size: ThumbnailSize,
): Promise<ThumbnailResult> {
  const metadata = await sharp(image).metadata();
  return {
    webp: await cropToThumbnail(image, size),
    details: { width: metadata.autoOrient.width, height: metadata.autoOrient.height },
  };
}
