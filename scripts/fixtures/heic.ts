// Writes HEIC photos as iPhones do: a grid of 512 px HEVC tiles (or one tile for a small picture)
// in a HEIF file. ffmpeg's libx265 encodes the tiles into an MP4, whose decoder setup (hvcC) and
// samples are moved into the HEIF boxes here, since ffmpeg can't write HEIF itself.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import sharp from 'sharp';

import { ffmpegPath } from './video.ts';

const runFile = promisify(execFile);

/** iPhones store photos in tiles of this size. */
const TILE = 512;

/** One box found in an MP4 file: its type and contents. */
type FoundBox = { readonly type: string; readonly body: Buffer };

/** What the HEIF file is made of: the tiles' setup and bytes, and how they make the picture. */
type Tiles = {
  readonly hvcC: Buffer;
  readonly samples: readonly Buffer[];
  readonly columns: number;
  readonly rows: number;
  readonly width: number;
  readonly height: number;
  /** Quarter turns anticlockwise the picture is shown with (irot). */
  readonly turns: number;
};

/** Lists the boxes in some bytes (32-bit sizes only, which is all ffmpeg writes here). */
function listBoxes(bytes: Buffer): FoundBox[] {
  const boxes: FoundBox[] = [];
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32BE(offset);
    boxes.push({
      type: bytes.toString('latin1', offset + 4, offset + 8),
      body: bytes.subarray(offset + 8, offset + size),
    });
    offset += size;
  }
  return boxes;
}

/** Follows a path of box types down from the top, skipping each box's own header bytes. */
function findBox(bytes: Buffer, steps: readonly [string, number][]): Buffer {
  let body = bytes;
  for (const [type, skip] of steps) {
    const found = listBoxes(body).find((box) => box.type === type);
    if (found === undefined) {
      throw new Error(`ffmpeg's MP4 has no ${type} box.`);
    }
    body = found.body.subarray(skip);
  }
  return body;
}

/** Reads the decoder setup and every sample (one per tile, in order) from ffmpeg's MP4. */
function readMp4Tiles(mp4: Buffer): { hvcC: Buffer; samples: Buffer[] } {
  const table = [
    ['moov', 0],
    ['trak', 0],
    ['mdia', 0],
    ['minf', 0],
    ['stbl', 0],
  ] as [string, number][];
  // stsd has a full-box header and a count; a visual sample entry has 78 bytes before its boxes.
  const hvcC = findBox(mp4, [...table, ['stsd', 8], ['hvc1', 78], ['hvcC', 0]]);
  const stsz = findBox(mp4, [...table, ['stsz', 0]]);
  const mdat = findBox(mp4, [['mdat', 0]]);
  const samples: Buffer[] = [];
  let offset = 0;
  // stsz: version and flags, one size for every sample (0 if they differ), the count, the sizes.
  const sharedSize = stsz.readUInt32BE(4);
  for (let i = 0; i < stsz.readUInt32BE(8); i += 1) {
    const size = sharedSize === 0 ? stsz.readUInt32BE(12 + i * 4) : sharedSize;
    samples.push(mdat.subarray(offset, offset + size));
    offset += size;
  }
  return { hvcC: Buffer.from(hvcC), samples };
}

/** Encodes a picture as HEVC tiles: padded to whole tiles, then cut into them by ffmpeg. */
async function encodeTiles(picture: Buffer): Promise<Omit<Tiles, 'turns'>> {
  const { width, height } = await sharp(picture).metadata();
  const [columns, rows] = [Math.ceil(width / TILE), Math.ceil(height / TILE)];
  // A picture that fits one tile is stored at its own size, as a plain image rather than a grid.
  const isGrid = columns * rows > 1;
  const padded = await sharp(picture)
    .extend({
      right: isGrid ? columns * TILE - width : 0,
      bottom: isGrid ? rows * TILE - height : 0,
      extendWith: 'copy',
    })
    .png()
    .toBuffer();
  const folder = await mkdtemp(path.join(os.tmpdir(), 'morgue-heic-'));
  try {
    await writeFile(path.join(folder, 'in.png'), padded);
    const tileLayout = `untile=${String(columns)}x${String(rows)}`;
    await runFile(ffmpegPath(), [
      ...['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(folder, 'in.png')],
      ...['-vf', tileLayout, '-c:v', 'libx265', '-preset', 'ultrafast', '-crf', '30'],
      ...['-x265-params', 'log-level=error:keyint=1:frame-threads=1:pools=none'],
      ...['-pix_fmt', 'yuv420p', '-profile:v', 'main', '-tag:v', 'hvc1', '-fflags', '+bitexact'],
      path.join(folder, 'out.mp4'),
    ]);
    const tiles = readMp4Tiles(await readFile(path.join(folder, 'out.mp4')));
    return { ...tiles, columns, rows, width, height };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/** A box: size, type, contents. */
function box(type: string, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(body.length + 8);
  header.write(type, 4, 'latin1');
  return Buffer.concat([header, body]);
}

/** The version and flags that start a full box's contents. */
type FullBoxHeader = { readonly version: number; readonly flags: number };

/** Version 0 with no flags, which most boxes here use. */
const PLAIN: FullBoxHeader = { version: 0, flags: 0 };

/** A full box: a box whose contents start with a version and 24 bits of flags. */
function fullBox(type: string, header: FullBoxHeader, ...parts: Buffer[]): Buffer {
  const { version, flags } = header;
  return box(type, Buffer.from([version, flags >> 16, (flags >> 8) & 255, flags & 255]), ...parts);
}

/** Whole numbers written big-endian, each in the given number of bytes. */
function numbers(...values: [number, 1 | 2 | 4][]): Buffer {
  return Buffer.concat(
    values.map(([value, size]) => {
      const bytes = Buffer.alloc(size);
      bytes.writeUIntBE(value, 0, size);
      return bytes;
    }),
  );
}

/** How the items are numbered: tiles from 1, and a grid after them if there is more than one. */
type Layout = { readonly tileCount: number; readonly isGrid: boolean; readonly primaryId: number };

/** Numbers the items of a set of tiles. */
function layoutOf(tiles: Tiles): Layout {
  const tileCount = tiles.samples.length;
  const isGrid = tileCount > 1;
  return { tileCount, isGrid, primaryId: isGrid ? tileCount + 1 : 1 };
}

/** An item's entry in iinf; tiles of a grid are hidden, as they aren't pictures on their own. */
function itemEntry(id: number, type: string, isHidden: boolean): Buffer {
  const name = Buffer.from(`${type}\0`, 'latin1');
  return fullBox('infe', { version: 2, flags: isHidden ? 1 : 0 }, numbers([id, 2], [0, 2]), name);
}

/** iinf, and for a grid, iref naming its tiles in order. */
function itemInfo({ tileCount, isGrid, primaryId }: Layout): Buffer[] {
  const tileIds = Array.from({ length: tileCount }, (_, i) => i + 1);
  const entries = tileIds.map((id) => itemEntry(id, 'hvc1', isGrid));
  if (!isGrid) {
    return [fullBox('iinf', PLAIN, numbers([1, 2]), ...entries)];
  }
  entries.push(itemEntry(primaryId, 'grid', false));
  const parts = tileIds.map((id): [number, 2] => [id, 2]);
  const dimg = box('dimg', numbers([primaryId, 2], [tileCount, 2], ...parts));
  return [
    fullBox('iinf', PLAIN, numbers([entries.length, 2]), ...entries),
    fullBox('iref', PLAIN, dimg),
  ];
}

/** An ispe property: an image's width and height. */
function sizeProperty(width: number, height: number): Buffer {
  return fullBox('ispe', PLAIN, numbers([width, 4], [height, 4]));
}

/**
 * iprp: the properties (1 decoder setup, 2 tile size, 3 picture size, 4 turn) and which item has
 * which. Each tile has 1 and 2; the picture has 3 and 4, or all but 3 if it is a single tile.
 */
function itemProperties(tiles: Tiles, layout: Layout): Buffer {
  const tileSize = layout.isGrid
    ? sizeProperty(TILE, TILE)
    : sizeProperty(tiles.width, tiles.height);
  const properties = box(
    'ipco',
    box('hvcC', tiles.hvcC),
    tileSize,
    sizeProperty(tiles.width, tiles.height),
    box('irot', Buffer.from([tiles.turns & 3])),
  );
  // Each link is a property's number; the top bit marks it as one a reader must understand.
  const tileLinks = Array.from({ length: layout.tileCount }, (_, i) =>
    layout.isGrid
      ? numbers([i + 1, 2], [2, 1], [0x81, 1], [0x02, 1])
      : numbers([i + 1, 2], [3, 1], [0x81, 1], [0x02, 1], [0x84, 1]),
  );
  const pictureLinks = layout.isGrid
    ? [numbers([layout.primaryId, 2], [2, 1], [0x03, 1], [0x84, 1])]
    : [];
  const links = [...tileLinks, ...pictureLinks];
  return box('iprp', properties, fullBox('ipma', PLAIN, numbers([links.length, 4]), ...links));
}

/** The grid's description: version, flags, rows and columns less one, then the picture's size. */
function gridDescription(tiles: Tiles): Buffer {
  return numbers(
    [0, 1],
    [0, 1],
    [tiles.rows - 1, 1],
    [tiles.columns - 1, 1],
    [tiles.width, 2],
    [tiles.height, 2],
  );
}

/** The meta box, its iloc pointing at each item's bytes in mdat. */
function metaBox(tiles: Tiles, itemBytes: readonly Buffer[], offsets: readonly number[]): Buffer {
  // hdlr: no pre-defined value, the handler 'pict', 12 reserved bytes and an empty name.
  const handler = fullBox(
    'hdlr',
    PLAIN,
    numbers([0, 4]),
    Buffer.from('pict', 'latin1'),
    Buffer.alloc(13),
  );
  const locations = itemBytes.map((bytes, i) =>
    numbers([i + 1, 2], [0, 2], [1, 2], [offsets[i] ?? 0, 4], [bytes.length, 4]),
  );
  // 0x44: offsets and lengths take 4 bytes each, with no base offset.
  const iloc = fullBox(
    'iloc',
    PLAIN,
    numbers([0x44, 1], [0, 1], [itemBytes.length, 2]),
    ...locations,
  );
  const layout = layoutOf(tiles);
  const pitm = fullBox('pitm', PLAIN, numbers([layout.primaryId, 2]));
  const properties = itemProperties(tiles, layout);
  return fullBox('meta', PLAIN, handler, pitm, iloc, ...itemInfo(layout), properties);
}

/** Puts the tiles in a HEIF file: ftyp, meta (with iloc pointing into mdat), then mdat. */
function writeHeif(tiles: Tiles): Buffer {
  const itemBytes =
    tiles.samples.length > 1 ? [...tiles.samples, gridDescription(tiles)] : [...tiles.samples];
  const ftyp = box('ftyp', Buffer.from('heic\0\0\0\0mif1heic', 'latin1'));
  // The offsets don't change the meta box's size, so measure it once with zeros, then fill them in.
  let offset = ftyp.length + metaBox(tiles, itemBytes, []).length + 8;
  const offsets = itemBytes.map((bytes) => {
    const start = offset;
    offset += bytes.length;
    return start;
  });
  return Buffer.concat([ftyp, metaBox(tiles, itemBytes, offsets), box('mdat', ...itemBytes)]);
}

/**
 * Encodes a picture as a HEIC file. `turns` sets the irot property (quarter turns anticlockwise),
 * for testing that photos come out upright.
 */
export async function encodeHeic(picture: Buffer, turns = 0): Promise<Buffer> {
  return writeHeif({ ...(await encodeTiles(picture)), turns });
}
