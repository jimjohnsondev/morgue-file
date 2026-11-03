// A fresh library.db in a temporary data folder, for repository and field tests.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { openLibrary } from '#core/db/library.js';
import { insertItem } from '#core/db/repositories/items.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';

import type { Db } from '#core/db/connection.js';
import type { ItemKind } from '#core/db/repositories/items.js';

/** An open, migrated library and how to delete it. */
export type TempLibrary = {
  readonly db: Db;
  readonly dataDir: string;
  readonly remove: () => Promise<void>;
};

/** Opens a migrated library whose root 1 points at a folder that need not exist. */
export async function makeTempLibrary(referenceDir = 'C:\\Reference'): Promise<TempLibrary> {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-db-'));
  const db = openLibrary({ dataDir, appVersion: '0.0.0-test', referenceDir });
  return {
    db,
    dataDir,
    remove: async () => {
      db.close();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

/** Adds an item under root 1 with placeholder size and dates, and returns its id. */
export function addTestItem(db: Db, relPath: string, kind: ItemKind = 'image'): number {
  return insertItem(db, {
    rootId: REFERENCE_ROOT_ID,
    relPath,
    kind,
    size: 1000,
    mtimeMs: Date.parse('2026-10-01T00:00:00Z'),
    addedAt: '2026-10-31T12:00:00.000Z',
  });
}
