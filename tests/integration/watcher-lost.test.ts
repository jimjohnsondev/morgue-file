// R1 when the system stops reporting changes: a watcher lost during the startup scan is not
// kept, and the next 30 s check scans again and watches anew, so later files still show.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { findItemByPath } from '#core/db/repositories/items.js';
import { REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { startRootIndexing } from '#core/indexer/roots.js';

import { makeTempLibrary } from '../support/temp-library.ts';

import type * as Originals from '#core/archive/originals.js';
import type { WatchListener } from '#core/archive/originals.js';
import type { RootIndexing } from '#core/indexer/roots.js';
import type { TempLibrary } from '../support/temp-library.ts';

/** Every listener a watch was started with, so a test can report a failure to it. */
const listeners: WatchListener[] = [];

vi.mock('#core/archive/originals.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Originals>();
  return {
    ...actual,
    watchOriginals: (rootPath: string, listener: WatchListener) => {
      listeners.push(listener);
      return actual.watchOriginals(rootPath, listener);
    },
  };
});

const SILENT_LOG = { info: () => undefined, warn: () => undefined, error: () => undefined };

let referenceDir: string;
let library: TempLibrary;
let indexing: RootIndexing | undefined;

/** Writes a small file under the Reference folder. */
async function writeArchiveFile(relPath: string): Promise<void> {
  const file = path.join(referenceDir, relPath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(relPath));
}

/** Polls until a check passes; fails after 5 s, R1's limit. */
async function waitFor(check: () => boolean): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > 5000) {
      throw new Error('Still waiting after 5 s');
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

beforeEach(async () => {
  listeners.length = 0;
  referenceDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-lost-'));
  await writeArchiveFile('Figure/seated_001.jpg');
  await writeArchiveFile('Hands/hands_001.jpg');
  library = await makeTempLibrary(referenceDir);
});

afterEach(async () => {
  await indexing?.stop();
  await library.remove();
  await rm(referenceDir, { recursive: true, force: true });
});

describe('R1: a lost watcher', () => {
  it('R1: a watcher lost during the startup scan is replaced at the next check', async () => {
    indexing = startRootIndexing({
      db: library.db,
      rootId: REFERENCE_ROOT_ID,
      log: SILENT_LOG,
      wakeQueue: () => undefined,
      recheckMs: 600_000,
    });
    indexing.pause();
    await waitFor(() => indexing!.progress()?.found !== 0);
    listeners[0]!.onError(new Error('The system stopped reporting changes'));
    indexing.resume();
    await indexing.whenIdle();

    await indexing.checkNow();
    await indexing.whenIdle();
    expect(listeners).toHaveLength(2);
    await writeArchiveFile('Hands/hands_002.jpg');
    await waitFor(
      () => findItemByPath(library.db, REFERENCE_ROOT_ID, 'Hands/hands_002.jpg') !== undefined,
    );
  });
});
