// Reads an HTTP Range header, so videos can seek and pdf.js can fetch a PDF piece by piece.
import type { ByteRange } from '#core/archive/originals.js';

/**
 * What a Range header asks of a file: the whole file (no header, or one the server may ignore,
 * such as several ranges), one range of it, or a range past its end, which is refused with 416.
 */
export type RangeRequest =
  | { readonly kind: 'whole' }
  | { readonly kind: 'part'; readonly range: ByteRange }
  | { readonly kind: 'unsatisfiable' };

/** `bytes=0-499`, `bytes=500-` or `bytes=-500` (the last 500 bytes). */
const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

/** Reads `bytes=500-`'s two ends as a range of a file of the given size. */
function toRange(first: string, last: string, size: number): RangeRequest {
  if (first === '') {
    const suffix = Number(last);
    return suffix === 0 || size === 0
      ? { kind: 'unsatisfiable' }
      : { kind: 'part', range: { start: Math.max(0, size - suffix), end: size - 1 } };
  }
  const start = Number(first);
  const end = last === '' ? size - 1 : Math.min(Number(last), size - 1);
  if (start >= size || end < start) {
    return { kind: 'unsatisfiable' };
  }
  return { kind: 'part', range: { start, end } };
}

/**
 * Reads a Range header against a file's size. Anything but one byte range is answered with the
 * whole file, which RFC 9110 allows and every browser handles.
 */
export function parseRangeHeader(header: string | undefined, size: number): RangeRequest {
  const match = header === undefined ? null : SINGLE_RANGE.exec(header.trim());
  if (match === null) {
    return { kind: 'whole' };
  }
  const [, first = '', last = ''] = match;
  if (first === '' && last === '') {
    return { kind: 'whole' };
  }
  return toRange(first, last, size);
}
