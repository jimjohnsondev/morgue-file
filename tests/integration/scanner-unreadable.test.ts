import { rm } from 'node:fs/promises';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { scanRoot } from '#core/indexer/scanner.js';

import { writeSampleArchive } from '../support/sample-archive.ts';
import { makeTempLibrary } from '../support/temp-library.ts';

import type * as Originals from '#core/archive/originals.js';
import type { SampleArchive } from '../support/sample-archive.ts';
import type { TempLibrary } from '../support/temp-library.ts';

/** Folders the stubbed listFolder refuses, as Windows does a folder the user may not open. */
const refusedFolders = new Set<string>();

vi.mock('#core/archive/originals.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Originals>();
  return {
    ...actual,
    listFolder: async (rootPath: string, relDir: string) => {
      if (refusedFolders.has(relDir)) {
        throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
      }
      return actual.listFolder(rootPath, relDir);
    },
  };
});

let archive: SampleArchive;
let library: TempLibrary;

beforeAll(async () => {
  archive = await writeSampleArchive();
  library = await makeTempLibrary(archive.referenceDir);
}, 120_000);

afterAll(async () => {
  await library.remove();
  await rm(archive.referenceDir, { recursive: true, force: true });
});

/** Paths of items marked missing. */
function missingPaths(): string[] {
  const rows = library.db
    .prepare('SELECT rel_path FROM items WHERE missing_since IS NOT NULL ORDER BY rel_path')
    .all() as { rel_path: string }[];
  return rows.map((row) => row.rel_path);
}

describe('a subfolder the scan cannot open', () => {
  it('leaves the files and page folders in it as they were, and scans the rest', async () => {
    await scanRoot({ db: library.db, rootId: REFERENCE_ROOT_ID, rootPath: archive.referenceDir });
    const pageFolder = archive.files.find((file) => file.kind === 'pagefolder')!;
    refusedFolders.add('Figure');
    refusedFolders.add(pageFolder.relPath);

    const summary = await scanRoot({
      db: library.db,
      rootId: REFERENCE_ROOT_ID,
      rootPath: archive.referenceDir,
    });

    expect(summary).toMatchObject({ unreadableFolders: 2, missing: 0 });
    expect(missingPaths()).toEqual([]);
  });
});
