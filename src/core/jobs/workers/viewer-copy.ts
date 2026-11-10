// Photos the browser can't show (HEIC, TIFF, PSD) get a full-size JPEG copy in the cache, which the
// image viewer opens and their thumbnails are cut from (docs/ARCHITECTURE.md, Thumbnails and media).
import path from 'node:path';

import sharp from 'sharp';

import { AppError } from '#core/errors.js';

import { decodeHeic } from './decode-heic.js';
import { decodePsd } from './decode-psd.js';

import type { MediaTools } from './media-tools.js';
import type { Sharp } from 'sharp';

/** A photo format Chromium can't show, so the viewer gets a copy. */
type CopiedFormat = 'heic' | 'tiff' | 'psd';

const COPIED_FORMAT_BY_EXTENSION: ReadonlyMap<string, CopiedFormat> = new Map([
  ['.heic', 'heic'],
  ['.tif', 'tiff'],
  ['.tiff', 'tiff'],
  ['.psd', 'psd'],
]);

/** Good enough to zoom into at full size, at about a fifth of the size of a PNG. */
const COPY_QUALITY = 90;

/** Transparent parts of a PSD or TIFF show on white, as they do in Photoshop's own preview. */
const BACKGROUND = { r: 255, g: 255, b: 255 };

/** Says whether a photo's viewer and thumbnails work from a copy rather than the original. */
export function needsViewerCopy(relPath: string): boolean {
  return COPIED_FORMAT_BY_EXTENSION.has(path.extname(relPath).toLowerCase());
}

/** Decodes a photo the browser can't show into a picture sharp can work with. */
async function decode(
  format: CopiedFormat,
  original: Buffer,
  tools: MediaTools | undefined,
): Promise<Sharp> {
  if (format === 'tiff') {
    return sharp(original).autoOrient();
  }
  if (format === 'psd') {
    return decodePsd(original);
  }
  if (tools === undefined) {
    throw new AppError('media-unreadable', 'ffmpeg was not found, so HEIC photos cannot be shown.');
  }
  return decodeHeic(tools, original);
}

/**
 * Makes the full-size JPEG copy of a photo the browser can't show, upright and on white. Only the
 * first page of a TIFF with several is used.
 */
export async function makeViewerCopy(
  relPath: string,
  original: Buffer,
  tools: MediaTools | undefined,
): Promise<Buffer> {
  const format = COPIED_FORMAT_BY_EXTENSION.get(path.extname(relPath).toLowerCase());
  if (format === undefined) {
    throw new AppError('invalid-input', `${relPath} is shown as it is and needs no copy.`);
  }
  const picture = await decode(format, original, tools);
  return picture.flatten({ background: BACKGROUND }).jpeg({ quality: COPY_QUALITY }).toBuffer();
}
