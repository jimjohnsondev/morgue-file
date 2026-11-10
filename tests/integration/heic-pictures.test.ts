// R7: a HEIC photo comes out whole and upright: iPhones save a grid of 512 px tiles, cropped to the
// picture, and may store the turn that makes it upright (irot) rather than turning the pixels.
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { findMediaTools } from '#core/jobs/workers/media-tools.js';
import { makeViewerCopy } from '#core/jobs/workers/viewer-copy.js';

import { figureSvg, renderSvg } from '../../scripts/fixtures/draw.ts';
import { encodeHeic } from '../../scripts/fixtures/heic.ts';
import { createRandom } from '../../scripts/fixtures/random.ts';

/** HEVC at the generator's quality changes flat colors by a few levels at most. */
const MOST_AVERAGE_DIFFERENCE = 3;

/** A placeholder photo as PNG, larger than one tile in both directions. */
async function drawPhoto(width: number, height: number): Promise<Buffer> {
  return renderSvg(figureSvg({ width, height, random: createRandom(7) }), 'png');
}

/** The average difference per channel between two pictures of the same size. */
async function averageDifference(left: Buffer, right: Buffer): Promise<number> {
  const [first, second] = await Promise.all(
    [left, right].map(async (picture) => sharp(picture).removeAlpha().raw().toBuffer()),
  );
  expect(first!.length).toBe(second!.length);
  let total = 0;
  for (let i = 0; i < first!.length; i += 1) {
    total += Math.abs(first![i]! - second![i]!);
  }
  return total / first!.length;
}

/** Decodes a HEIC file the way the viewer copy does. */
async function decode(heic: Buffer): Promise<Buffer> {
  return makeViewerCopy('photo.heic', heic, findMediaTools(process.cwd()));
}

describe('R7: decoding HEIC photos', () => {
  it('R7: joins a grid of tiles into the whole picture, cropped to its size', async () => {
    const photo = await drawPhoto(1300, 700);
    const copy = await decode(await encodeHeic(photo));
    expect(await sharp(copy).metadata()).toMatchObject({ width: 1300, height: 700 });
    expect(await averageDifference(copy, photo)).toBeLessThan(MOST_AVERAGE_DIFFERENCE);
  });

  it('R7: turns the picture upright by the quarter turns the file stores', async () => {
    const photo = await drawPhoto(900, 600);
    // One quarter turn anticlockwise, as irot counts them.
    const copy = await decode(await encodeHeic(photo, 1));
    const upright = await sharp(photo).rotate(270).png().toBuffer();
    expect(await sharp(copy).metadata()).toMatchObject({ width: 600, height: 900 });
    expect(await averageDifference(copy, upright)).toBeLessThan(MOST_AVERAGE_DIFFERENCE);
  });

  it('R7: reads a picture small enough to be a single tile', async () => {
    const photo = await drawPhoto(400, 300);
    const copy = await decode(await encodeHeic(photo));
    expect(await sharp(copy).metadata()).toMatchObject({ width: 400, height: 300 });
    expect(await averageDifference(copy, photo)).toBeLessThan(MOST_AVERAGE_DIFFERENCE);
  });

  it('refuses a grid that claims a picture larger than its tiles, before setting memory aside', async () => {
    const heic = await encodeHeic(await drawPhoto(1300, 700));
    // The grid's description is the file's last item: its last 4 bytes are its width and height.
    heic.writeUInt16BE(65_535, heic.length - 4);
    heic.writeUInt16BE(65_535, heic.length - 2);
    await expect(decode(heic)).rejects.toThrow('tiles do not cover the picture');
  });

  it('refuses a file that is not HEIF', async () => {
    await expect(decode(Buffer.from('not a picture'))).rejects.toThrow('HEIC');
  });
});
