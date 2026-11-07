// R24: snapshot tests of how SQLite plans each representative search, so a lost index shows up
// here before it shows up in the perf timings (docs/ARCHITECTURE.md, Search).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { explainItemsByQuery } from '#core/db/repositories/item-lists.js';
import { compileQuery } from '#core/query/compile-query.js';
import { parseQuery } from '#core/query/parse-query.js';

import { REPRESENTATIVE_SEARCHES } from '../support/search-queries.js';
import { makeTempLibrary } from '../support/temp-library.js';

import type { TempLibrary } from '../support/temp-library.js';

let library: TempLibrary;

beforeAll(async () => {
  library = await makeTempLibrary();
});

afterAll(async () => {
  await library.remove();
});

describe('R24: query plans', () => {
  it.each(REPRESENTATIVE_SEARCHES)('R24: plans "%s" on its indexes', (text) => {
    const plan = explainItemsByQuery(library.db, compileQuery(parseQuery(text)));
    expect(plan).toMatchSnapshot();
  });
});
