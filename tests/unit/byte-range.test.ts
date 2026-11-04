import { describe, expect, it } from 'vitest';

import { parseRangeHeader } from '#server/routes/byte-range.js';

describe('parseRangeHeader', () => {
  it('reads one range, an open end and a suffix', () => {
    expect(parseRangeHeader('bytes=0-99', 1000)).toEqual({
      kind: 'part',
      range: { start: 0, end: 99 },
    });
    expect(parseRangeHeader('bytes=900-', 1000)).toEqual({
      kind: 'part',
      range: { start: 900, end: 999 },
    });
    expect(parseRangeHeader('bytes=-100', 1000)).toEqual({
      kind: 'part',
      range: { start: 900, end: 999 },
    });
  });

  it('trims an end past the file to its last byte', () => {
    expect(parseRangeHeader('bytes=500-5000', 1000)).toEqual({
      kind: 'part',
      range: { start: 500, end: 999 },
    });
  });

  it('refuses a range that starts past the end', () => {
    expect(parseRangeHeader('bytes=1000-', 1000)).toEqual({ kind: 'unsatisfiable' });
    expect(parseRangeHeader('bytes=-0', 1000)).toEqual({ kind: 'unsatisfiable' });
  });

  it('answers anything else with the whole file', () => {
    expect(parseRangeHeader(undefined, 1000)).toEqual({ kind: 'whole' });
    expect(parseRangeHeader('bytes=0-1,5-9', 1000)).toEqual({ kind: 'whole' });
    expect(parseRangeHeader('items=0-1', 1000)).toEqual({ kind: 'whole' });
  });
});
