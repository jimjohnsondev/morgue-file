// Works out how a HEIC photo's picture is put together: one HEVC image, or a grid of HEVC tiles
// (as iPhones save them), each turned into an Annex B stream ffmpeg can decode, plus the turns
// and flips to show it upright.
import { AppError } from '#core/errors.js';

import { readHeifItems, readItemBytes, readNumber } from './heif-boxes.js';

import type { Box, HeifItems } from './heif-boxes.js';

/** A turn or flip, in the order the file lists them: turns are clockwise, as sharp takes them. */
export type HeifTransform =
  | { readonly kind: 'rotate'; readonly degrees: 90 | 180 | 270 }
  | { readonly kind: 'flip' | 'flop' };

/** What to decode and how to put it together. */
export type HeifPicture = {
  /** Each tile in rows from the top left, as an Annex B HEVC stream; one for a plain image. */
  readonly tiles: readonly Buffer[];
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly columns: number;
  /** The picture's size before transforms; the tiles may reach past it on the right and bottom. */
  readonly width: number;
  readonly height: number;
  readonly transforms: readonly HeifTransform[];
};

/** The start code that begins each NAL unit in an Annex B stream. */
const START_CODE = Buffer.from([0, 0, 0, 1]);

/** Refuses a picture this reader can't put together. */
function unsupported(detail: string): AppError {
  return new AppError('media-unreadable', `The HEIC picture can't be shown: ${detail}.`);
}

/** Finds an item's property of one type. */
function findProperty(items: HeifItems, id: number, type: string): Box | undefined {
  return items.propertiesById.get(id)?.find((property) => property.type === type);
}

/** Opens a cursor on a property's contents, after the version and flags of a full box. */
function cursorAfterHeader(items: HeifItems, box: Box): { bytes: Buffer; position: number } {
  return { bytes: items.bytes, position: box.start + 4 };
}

/** `ispe`: an image item's width and height. */
function readImageSize(items: HeifItems, id: number): { width: number; height: number } {
  const ispe = findProperty(items, id, 'ispe');
  if (ispe === undefined) {
    throw unsupported(`item ${String(id)} has no size`);
  }
  const cursor = cursorAfterHeader(items, ispe);
  return { width: readNumber(cursor, 4), height: readNumber(cursor, 4) };
}

/**
 * `hvcC`: the parameter sets (VPS, SPS, PPS) a tile is decoded with, as Annex B, and how many
 * bytes give each NAL unit's length in the tile's own bytes.
 */
function readDecoderSetup(items: HeifItems, id: number): { setup: Buffer; lengthSize: number } {
  const hvcC = findProperty(items, id, 'hvcC');
  if (hvcC === undefined) {
    throw unsupported(`tile ${String(id)} has no decoder setup`);
  }
  const cursor = { bytes: items.bytes, position: hvcC.start + 21 };
  const lengthSize = (readNumber(cursor, 1) & 3) + 1;
  const units: Buffer[] = [];
  for (let arrays = readNumber(cursor, 1); arrays > 0; arrays -= 1) {
    readNumber(cursor, 1);
    for (let count = readNumber(cursor, 2); count > 0; count -= 1) {
      const length = readNumber(cursor, 2);
      units.push(START_CODE, items.bytes.subarray(cursor.position, cursor.position + length));
      cursor.position += length;
    }
  }
  return { setup: Buffer.concat(units), lengthSize };
}

/** Turns one `hvc1` item into an Annex B stream: its parameter sets, then its NAL units. */
function tileStream(items: HeifItems, id: number): Buffer {
  if (items.typeById.get(id) !== 'hvc1') {
    throw unsupported(`tile ${String(id)} isn't HEVC`);
  }
  const { setup, lengthSize } = readDecoderSetup(items, id);
  const sample = readItemBytes(items, id);
  const parts = [setup];
  const cursor = { bytes: sample, position: 0 };
  while (cursor.position + lengthSize <= sample.length) {
    const length = readNumber(cursor, lengthSize);
    parts.push(START_CODE, sample.subarray(cursor.position, cursor.position + length));
    cursor.position += length;
  }
  return Buffer.concat(parts);
}

/** `irot` and `imir` on the picture, in the order they apply. */
function readTransforms(items: HeifItems, id: number): HeifTransform[] {
  const transforms: HeifTransform[] = [];
  for (const property of items.propertiesById.get(id) ?? []) {
    const value = (items.bytes[property.start] ?? 0) & 3;
    if (property.type === 'irot' && value !== 0) {
      // irot turns anticlockwise in quarter turns.
      transforms.push({ kind: 'rotate', degrees: ([270, 180, 90] as const)[value - 1] ?? 270 });
    } else if (property.type === 'imir') {
      // Axis 0 is vertical, so the picture flips left to right (sharp's flop).
      transforms.push({ kind: (value & 1) === 0 ? 'flop' : 'flip' });
    }
  }
  return transforms;
}

/** `grid`: a picture made of tiles, rows × columns, cropped to its own width and height. */
function gridPicture(items: HeifItems, id: number): HeifPicture {
  const cursor = { bytes: readItemBytes(items, id), position: 1 };
  const isLarge = (readNumber(cursor, 1) & 1) === 1;
  const rows = readNumber(cursor, 1) + 1;
  const columns = readNumber(cursor, 1) + 1;
  const width = readNumber(cursor, isLarge ? 4 : 2);
  const height = readNumber(cursor, isLarge ? 4 : 2);
  const tileIds = items.partsById.get(id) ?? [];
  const [firstTile] = tileIds;
  if (firstTile === undefined || tileIds.length !== rows * columns) {
    throw unsupported(
      `the grid lists ${String(tileIds.length)} tiles for ${String(rows * columns)}`,
    );
  }
  const tileSize = readImageSize(items, firstTile);
  return {
    tiles: tileIds.map((tileId) => tileStream(items, tileId)),
    tileWidth: tileSize.width,
    tileHeight: tileSize.height,
    columns,
    width,
    height,
    transforms: readTransforms(items, id),
  };
}

/** Reads how a HEIC file's picture is made, refusing any kind but an HEVC image or grid. */
export function readHeifPicture(bytes: Buffer): HeifPicture {
  const items = readHeifItems(bytes);
  const id = items.primaryId;
  const type = items.typeById.get(id);
  if (type === 'grid') {
    return gridPicture(items, id);
  }
  if (type !== 'hvc1') {
    throw unsupported(`its picture is stored as ${type ?? 'nothing'}`);
  }
  const size = readImageSize(items, id);
  return {
    tiles: [tileStream(items, id)],
    tileWidth: size.width,
    tileHeight: size.height,
    columns: 1,
    ...size,
    transforms: readTransforms(items, id),
  };
}
