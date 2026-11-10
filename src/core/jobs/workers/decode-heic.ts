// Decodes a HEIC photo. sharp's prebuilt libvips can't decode HEVC, so ffmpeg decodes each tile to
// raw RGB and the tiles are laid side by side here (docs/ARCHITECTURE.md, Thumbnails and media).
import sharp from 'sharp';

import { AppError } from '#core/errors.js';

import { readHeifPicture } from './heif-image.js';
import { runTool } from './run-tool.js';

import type { HeifPicture, HeifTransform } from './heif-image.js';
import type { MediaTools } from './media-tools.js';
import type { Sharp } from 'sharp';

/** Raw RGB pixels and their size, as sharp reads and writes them. */
type RawPicture = {
  readonly data: Buffer;
  readonly info: { readonly width: number; readonly height: number; readonly channels: 3 };
};

const CHANNELS = 3;

/** Decodes every tile, one after another, with ffmpeg: one raw RGB frame per tile. */
async function decodeTiles(tools: MediaTools, picture: HeifPicture): Promise<Buffer> {
  const tileBytes = picture.tileWidth * picture.tileHeight * CHANNELS;
  const expected = tileBytes * picture.tiles.length;
  const args = ['-v', 'error', '-f', 'hevc', '-i', '-', '-fps_mode', 'passthrough'];
  const frames = await runTool(
    tools.ffmpeg,
    [...args, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    {
      input: Buffer.concat(picture.tiles),
      maxOutputBytes: expected,
    },
  );
  if (frames.length !== expected) {
    throw new AppError('media-unreadable', 'ffmpeg decoded the wrong number of HEIC tiles.');
  }
  return frames;
}

/** Lays the decoded tiles out in rows, leaving out what lies past the right or bottom edge. */
function joinTiles(picture: HeifPicture, frames: Buffer): Buffer {
  const { tileWidth, tileHeight, width, height } = picture;
  const pixels = Buffer.alloc(width * height * CHANNELS);
  for (let i = 0; i < picture.tiles.length; i += 1) {
    const left = (i % picture.columns) * tileWidth;
    const top = Math.floor(i / picture.columns) * tileHeight;
    const rowBytes = Math.min(tileWidth, width - left) * CHANNELS;
    for (let j = 0; j < Math.min(tileHeight, height - top); j += 1) {
      const from = (i * tileHeight + j) * tileWidth * CHANNELS;
      frames.copy(pixels, ((top + j) * width + left) * CHANNELS, from, from + rowBytes);
    }
  }
  return pixels;
}

/** Applies one turn or flip. sharp orders its own operations, so each is a pass of its own. */
async function transform(raw: RawPicture, step: HeifTransform): Promise<RawPicture> {
  const image = sharp(raw.data, { raw: raw.info });
  if (step.kind === 'rotate') {
    image.rotate(step.degrees);
  } else {
    image[step.kind]();
  }
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  return { data, info: { width: info.width, height: info.height, channels: CHANNELS } };
}

/** Decodes a HEIC photo to an upright picture, ready for sharp. */
export async function decodeHeic(tools: MediaTools, bytes: Buffer): Promise<Sharp> {
  const picture = readHeifPicture(bytes);
  const frames = await decodeTiles(tools, picture);
  let raw: RawPicture = {
    data: joinTiles(picture, frames),
    info: { width: picture.width, height: picture.height, channels: CHANNELS },
  };
  for (const step of picture.transforms) {
    raw = await transform(raw, step);
  }
  return sharp(raw.data, { raw: raw.info });
}
