// Writes Photoshop files with ag-psd: one flattened picture and no layers, which is what the app
// reads from any PSD (a file saved with "Maximize compatibility").
import { writePsdBuffer } from 'ag-psd';
import sharp from 'sharp';

/** Encodes a picture as a PSD file. */
export async function encodePsd(picture: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(picture)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  return writePsdBuffer({
    width,
    height,
    imageData: {
      width,
      height,
      data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
    },
  });
}
