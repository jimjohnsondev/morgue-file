// Decodes a Photoshop file's preview: the flattened picture Photoshop stores beside the layers,
// read with ag-psd (docs/ARCHITECTURE.md, Thumbnails and media). Layers are never drawn.
import { initializeCanvas, readPsd } from 'ag-psd';
import sharp from 'sharp';

import { AppError } from '#core/errors.js';

import type { PixelData } from 'ag-psd';
import type { Sharp } from 'sharp';

/** Refuses to make a canvas: reading only the flattened picture as pixels never needs one. */
function refuseCanvas(): never {
  throw new AppError('media-unreadable', 'Reading a PSD file asked for a canvas.');
}

/** Makes ag-psd's pixel buffers as plain arrays, so it needs no canvas library. */
function createPixels(width: number, height: number): ImageData {
  const pixels = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  return pixels as unknown as ImageData;
}

initializeCanvas(refuseCanvas, createPixels);

/** Brings 16- and 32-bit channels down to 8 bits, which is all a preview needs. */
function toEightBit(pixels: PixelData['data']): Buffer {
  if (pixels instanceof Uint8ClampedArray || pixels instanceof Uint8Array) {
    return Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  }
  const scale = pixels instanceof Uint16Array ? 1 / 257 : 255;
  const bytes = Buffer.alloc(pixels.length);
  for (let i = 0; i < pixels.length; i += 1) {
    bytes[i] = Math.round(Math.min(255, Math.max(0, (pixels[i] ?? 0) * scale)));
  }
  return bytes;
}

/** Decodes a PSD file's flattened picture, ready for sharp. */
export function decodePsd(bytes: Buffer): Sharp {
  let composite: PixelData | undefined;
  try {
    composite = readPsd(bytes, {
      skipLayerImageData: true,
      skipThumbnail: true,
      useImageData: true,
    }).imageData;
  } catch (error) {
    throw new AppError('media-unreadable', `The PSD file can't be read: ${String(error)}`);
  }
  if (composite === undefined) {
    throw new AppError('media-unreadable', 'The PSD file has no flattened picture to show.');
  }
  const { width, height } = composite;
  const channels = composite.data.length / (width * height);
  if (channels !== 3 && channels !== 4) {
    throw new AppError('media-unreadable', 'The PSD file’s picture has an unexpected layout.');
  }
  return sharp(toEightBit(composite.data), { raw: { width, height, channels } });
}
