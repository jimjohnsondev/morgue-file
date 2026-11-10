// Reads the boxes of a HEIF file (HEIC photos): which item is the picture, where each item's bytes
// are, which items a grid is made of, and each item's properties (ISO/IEC 23008-12, ISO 14496-12).
import { AppError } from '#core/errors.js';

/** One box: its four-letter type and where its contents start and end in the file. */
export type Box = {
  readonly type: string;
  readonly start: number;
  readonly end: number;
};

/** Where an item's bytes are: in the file, or in the `idat` box of the meta box. */
type ItemLocation = {
  readonly inIdat: boolean;
  readonly extents: readonly { readonly offset: number; readonly length: number }[];
};

/** What the meta box says about the file's items. */
export type HeifItems = {
  readonly bytes: Buffer;
  readonly primaryId: number;
  readonly typeById: ReadonlyMap<number, string>;
  readonly locationById: ReadonlyMap<number, ItemLocation>;
  /** The items each grid is made of, in order (`dimg` references). */
  readonly partsById: ReadonlyMap<number, readonly number[]>;
  readonly propertiesById: ReadonlyMap<number, readonly Box[]>;
  readonly idat: Box | undefined;
};

/** A read position in the file. */
type Cursor = { readonly bytes: Buffer; position: number };

/** Refuses a file that isn't laid out as HEIF says. */
function malformed(detail: string): AppError {
  return new AppError('media-unreadable', `The HEIC file can't be read: ${detail}.`);
}

/** Reads a big-endian whole number of 0 to 8 bytes and moves past it. */
export function readNumber(cursor: Cursor, byteCount: number): number {
  if (cursor.position + byteCount > cursor.bytes.length) {
    throw malformed('it ends early');
  }
  let value = 0;
  for (let i = 0; i < byteCount; i += 1) {
    value = value * 256 + (cursor.bytes[cursor.position + i] ?? 0);
  }
  cursor.position += byteCount;
  return value;
}

/** Reads a four-letter code and moves past it. */
function readType(cursor: Cursor): string {
  const end = cursor.position + 4;
  const type = cursor.bytes.toString('latin1', cursor.position, end);
  cursor.position = end;
  return type;
}

/** Lists the boxes between two positions. A size of 1 means a 64-bit size follows; 0, to the end. */
export function readBoxes(bytes: Buffer, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  const cursor = { bytes, position: start };
  while (cursor.position + 8 <= end) {
    const boxStart = cursor.position;
    let size = readNumber(cursor, 4);
    const type = readType(cursor);
    if (size === 1) {
      size = readNumber(cursor, 8);
    } else if (size === 0) {
      size = end - boxStart;
    }
    if (size < cursor.position - boxStart || boxStart + size > end) {
      throw malformed(`the ${type} box has a size that doesn't fit`);
    }
    boxes.push({ type, start: cursor.position, end: boxStart + size });
    cursor.position = boxStart + size;
  }
  return boxes;
}

/** Finds the one box of a type, refusing a file without it. */
function requireBox(boxes: readonly Box[], type: string): Box {
  const found = boxes.find((box) => box.type === type);
  if (found === undefined) {
    throw malformed(`it has no ${type} box`);
  }
  return found;
}

/** Starts reading a full box: returns its version and flags and a cursor past them. */
function openFullBox(bytes: Buffer, box: Box): { version: number; flags: number; cursor: Cursor } {
  const cursor = { bytes, position: box.start };
  const version = readNumber(cursor, 1);
  return { version, flags: readNumber(cursor, 3), cursor };
}

/** The boxes inside a full box such as `meta` or `iinf`, which start after a header. */
function childBoxes(bytes: Buffer, box: Box, headerLength: number): Box[] {
  return readBoxes(bytes, box.start + headerLength, box.end);
}

/** `pitm`: the id of the item the file shows. */
function readPrimaryId(bytes: Buffer, box: Box): number {
  const { version, cursor } = openFullBox(bytes, box);
  return readNumber(cursor, version === 0 ? 2 : 4);
}

/** `iinf`: each item's type, from its `infe` box (versions 2 and 3; older ones carry no type). */
function readItemTypes(bytes: Buffer, box: Box): Map<number, string> {
  const { version } = openFullBox(bytes, box);
  const types = new Map<number, string>();
  for (const entry of childBoxes(bytes, box, version === 0 ? 6 : 8)) {
    const infe = openFullBox(bytes, entry);
    if (entry.type !== 'infe' || infe.version < 2) {
      continue;
    }
    const id = readNumber(infe.cursor, infe.version === 2 ? 2 : 4);
    readNumber(infe.cursor, 2);
    types.set(id, readType(infe.cursor));
  }
  return types;
}

/** `iloc`: where each item's bytes are. */
function readLocations(bytes: Buffer, box: Box): Map<number, ItemLocation> {
  const { version, cursor } = openFullBox(bytes, box);
  const sizes = readNumber(cursor, 2);
  const [offsetSize, lengthSize, baseSize] = [sizes >> 12, (sizes >> 8) & 15, (sizes >> 4) & 15];
  const indexSize = version === 0 ? 0 : sizes & 15;
  const idSize = version < 2 ? 2 : 4;
  const locations = new Map<number, ItemLocation>();
  const count = readNumber(cursor, idSize);
  for (let i = 0; i < count; i += 1) {
    const id = readNumber(cursor, idSize);
    const method = version === 0 ? 0 : readNumber(cursor, 2) & 15;
    readNumber(cursor, 2);
    const base = readNumber(cursor, baseSize);
    const extents = [];
    for (let j = readNumber(cursor, 2); j > 0; j -= 1) {
      readNumber(cursor, indexSize);
      const offset = base + readNumber(cursor, offsetSize);
      extents.push({ offset, length: readNumber(cursor, lengthSize) });
    }
    locations.set(id, { inIdat: method === 1, extents });
  }
  return locations;
}

/** `iref`: the items each `dimg` (derived image) reference names, such as a grid's tiles. */
function readParts(bytes: Buffer, box: Box | undefined): Map<number, number[]> {
  const parts = new Map<number, number[]>();
  if (box === undefined) {
    return parts;
  }
  const idSize = openFullBox(bytes, box).version === 0 ? 2 : 4;
  for (const reference of childBoxes(bytes, box, 4)) {
    const cursor = { bytes, position: reference.start };
    const fromId = readNumber(cursor, idSize);
    const toIds = [];
    for (let count = readNumber(cursor, 2); count > 0; count -= 1) {
      toIds.push(readNumber(cursor, idSize));
    }
    if (reference.type === 'dimg') {
      parts.set(fromId, toIds);
    }
  }
  return parts;
}

/** One `ipma` box: adds the properties it gives each item to `assigned`, in order. */
function assignProperties(
  bytes: Buffer,
  ipma: Box,
  { properties, assigned }: { properties: readonly Box[]; assigned: Map<number, Box[]> },
): void {
  const { version, flags, cursor } = openFullBox(bytes, ipma);
  const isWide = (flags & 1) === 1;
  for (let count = readNumber(cursor, 4); count > 0; count -= 1) {
    const id = readNumber(cursor, version === 0 ? 2 : 4);
    const list = assigned.get(id) ?? [];
    for (let links = readNumber(cursor, 1); links > 0; links -= 1) {
      // The top bit marks a property as essential; the rest is its place in ipco, from 1.
      const index = readNumber(cursor, isWide ? 2 : 1) & (isWide ? 0x7fff : 0x7f);
      const property = properties[index - 1];
      if (property !== undefined) {
        list.push(property);
      }
    }
    assigned.set(id, list);
  }
}

/** `iprp`: each item's properties (`ipco` boxes, as `ipma` assigns them), in order. */
function readProperties(bytes: Buffer, box: Box): Map<number, Box[]> {
  const children = readBoxes(bytes, box.start, box.end);
  const properties = childBoxes(bytes, requireBox(children, 'ipco'), 0);
  const assigned = new Map<number, Box[]>();
  for (const ipma of children.filter((child) => child.type === 'ipma')) {
    assignProperties(bytes, ipma, { properties, assigned });
  }
  return assigned;
}

/** Reads what a HEIF file's meta box says about its items. */
export function readHeifItems(bytes: Buffer): HeifItems {
  const meta = requireBox(readBoxes(bytes, 0, bytes.length), 'meta');
  const boxes = childBoxes(bytes, meta, 4);
  return {
    bytes,
    primaryId: readPrimaryId(bytes, requireBox(boxes, 'pitm')),
    typeById: readItemTypes(bytes, requireBox(boxes, 'iinf')),
    locationById: readLocations(bytes, requireBox(boxes, 'iloc')),
    partsById: readParts(
      bytes,
      boxes.find((box) => box.type === 'iref'),
    ),
    propertiesById: readProperties(bytes, requireBox(boxes, 'iprp')),
    idat: boxes.find((box) => box.type === 'idat'),
  };
}

/** Returns an item's bytes, joining its extents. */
export function readItemBytes(items: HeifItems, id: number): Buffer {
  const location = items.locationById.get(id);
  if (location === undefined) {
    throw malformed(`item ${String(id)} has no location`);
  }
  const base = location.inIdat ? (items.idat?.start ?? Number.NaN) : 0;
  const parts = location.extents.map(({ offset, length }) => {
    const start = base + offset;
    if (!(start >= 0) || start + length > items.bytes.length) {
      throw malformed(`item ${String(id)} lies outside the file`);
    }
    return items.bytes.subarray(start, start + length);
  });
  return Buffer.concat(parts);
}
