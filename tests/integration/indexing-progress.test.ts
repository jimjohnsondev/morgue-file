// The numbers behind the E5 progress bar: the quick count of a Reference folder's files, and the
// files a scan reports as it lists each folder, which must count the same things.
import { readdir, rm } from 'node:fs/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { countFiles } from '#core/archive/originals.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { scanRoot } from '#core/indexer/scanner.js';

import { writeSampleArchive } from '../support/sample-archive.ts';
import { makeTempLibrary } from '../support/temp-library.ts';

import type { SampleArchive } from '../support/sample-archive.ts';
import type { TempLibrary } from '../support/temp-library.ts';

let archive: SampleArchive;
let library: TempLibrary;

/** Counts every regular file under a folder with Node’s own recursive listing. */
async function countByListing(folder: string): Promise<number> {
  const entries = await readdir(folder, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile()).length;
}

beforeAll(async () => {
  archive = await writeSampleArchive();
  library = await makeTempLibrary(archive.referenceDir);
}, 120_000);

afterAll(async () => {
  await library.remove();
  await rm(archive.referenceDir, { recursive: true, force: true });
});

describe('E5: first index running', () => {
  it('counts every file under the Reference folder, page-folder pages and ignored files too', async () => {
    const expected = await countByListing(archive.referenceDir);
    expect(expected).toBeGreaterThan(archive.files.length);
    expect(await countFiles(archive.referenceDir)).toBe(expected);
  });

  it('reports as many files found during the scan as the count said there were', async () => {
    let found = 0;
    await scanRoot({
      db: library.db,
      rootId: REFERENCE_ROOT_ID,
      rootPath: archive.referenceDir,
      onFilesFound: (fileCount) => {
        found += fileCount;
      },
    });
    expect(found).toBe(await countFiles(archive.referenceDir));
  });
});
