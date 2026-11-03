import { rename, rm, utimes } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { findItemByPath } from '#core/db/repositories/items.js';
import { findJob } from '#core/db/repositories/jobs.js';
import { findRootById, REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { scanRoot } from '#core/indexer/scanner.js';

import { writeSampleArchive } from '../support/sample-archive.ts';
import { makeTempLibrary } from '../support/temp-library.ts';

import type { SampleArchive } from '../support/sample-archive.ts';
import type { TempLibrary } from '../support/temp-library.ts';

let archive: SampleArchive;
let library: TempLibrary;

const NOW = new Date('2026-10-31T12:00:00.000Z');

/** Scans the sample archive's root at a fixed time. */
async function scan(at = NOW): Promise<Awaited<ReturnType<typeof scanRoot>>> {
  return scanRoot({
    db: library.db,
    rootId: REFERENCE_ROOT_ID,
    rootPath: archive.referenceDir,
    now: () => at,
  });
}

/** Every item as kind and section, by path. */
function itemsByPath(): Map<string, { kind: string; section: string; missing: boolean }> {
  const rows = library.db
    .prepare('SELECT rel_path, kind, section, missing_since FROM items ORDER BY rel_path')
    .all() as { rel_path: string; kind: string; section: string; missing_since: string | null }[];
  return new Map(
    rows.map((row) => [
      row.rel_path,
      { kind: row.kind, section: row.section, missing: row.missing_since !== null },
    ]),
  );
}

beforeAll(async () => {
  archive = await writeSampleArchive();
  library = await makeTempLibrary(archive.referenceDir);
}, 120_000);

afterAll(async () => {
  await library.remove();
  await rm(archive.referenceDir, { recursive: true, force: true });
});

describe('the one-shot scanner', () => {
  it('R4: indexes each file once, in exactly one media section', async () => {
    const summary = await scan();
    const items = itemsByPath();
    expect(summary).toMatchObject({ isOffline: false, added: 11, missing: 0, ignored: 1 });
    expect(items.size).toBe(11);
    for (const file of archive.files) {
      expect(items.get(file.relPath)?.kind).toBe(file.kind);
    }
    const sections = [...items.values()].map((item) => item.section);
    expect(sections.filter((section) => section === 'photos')).toHaveLength(6);
    expect(sections.filter((section) => section === 'video')).toHaveLength(2);
    expect(sections.filter((section) => section === 'library')).toHaveLength(3);
  });

  it('R6: indexes a folder of page scans as one Library item, not as photos', () => {
    const pageFolder = archive.files.find((file) => file.kind === 'pagefolder')!;
    const items = itemsByPath();
    expect(items.get(pageFolder.relPath)).toMatchObject({ kind: 'pagefolder', section: 'library' });
    expect(
      [...items.keys()].filter((relPath) => relPath.startsWith(`${pageFolder.relPath}/`)),
    ).toEqual([]);
  });

  it('keeps numbered screenshots in the Inbox as photos', () => {
    const items = itemsByPath();
    expect(items.get('Inbox/2026-10/1.png')).toMatchObject({ kind: 'image', section: 'photos' });
    expect(items.has('Inbox/2026-10')).toBe(false);
  });

  it('files new items by their date and queues a background thumbnail for each', () => {
    const jpg = archive.files[0]!;
    const item = findItemByPath(library.db, REFERENCE_ROOT_ID, jpg.relPath)!;
    expect(item.addedAt).toBe(new Date(jpg.mtimeMs).toISOString());
    expect(item.thumbState).toBe('pending');
    expect(findJob(library.db, item.id, 'thumb-image')).toMatchObject({
      state: 'queued',
      priority: 2,
    });
    expect(findRootById(library.db, REFERENCE_ROOT_ID)?.lastScanAt).toBe(NOW.toISOString());
  });

  it('changes nothing when nothing on disk changed', async () => {
    expect(await scan()).toMatchObject({ added: 0, changed: 0, unchanged: 11, missing: 0 });
  });

  it('re-reads a file whose time changed', async () => {
    const jpg = archive.files[0]!;
    const later = new Date('2026-11-01T09:00:00Z');
    await utimes(path.join(archive.referenceDir, jpg.relPath), later, later);
    expect(await scan()).toMatchObject({ changed: 1, unchanged: 10 });
    expect(findItemByPath(library.db, REFERENCE_ROOT_ID, jpg.relPath)?.mtimeMs).toBe(
      later.getTime(),
    );
  });

  it('marks a vanished file missing without deleting it, and clears that when it is back', async () => {
    const pdf = archive.files.find((file) => file.kind === 'pdf')!;
    const pdfPath = path.join(archive.referenceDir, pdf.relPath);
    await rename(pdfPath, `${pdfPath}.away`);
    expect(await scan()).toMatchObject({ missing: 1 });
    expect(itemsByPath().get(pdf.relPath)?.missing).toBe(true);
    await rename(`${pdfPath}.away`, pdfPath);
    expect(await scan()).toMatchObject({ missing: 0, unchanged: 11 });
    expect(itemsByPath().get(pdf.relPath)?.missing).toBe(false);
  });

  it('marks an unreachable root offline and leaves every item as it was', async () => {
    const before = itemsByPath();
    const summary = await scanRoot({
      db: library.db,
      rootId: REFERENCE_ROOT_ID,
      rootPath: path.join(archive.referenceDir, 'unplugged-drive'),
    });
    expect(summary.isOffline).toBe(true);
    expect(itemsByPath()).toEqual(before);
    expect(findRootById(library.db, REFERENCE_ROOT_ID)?.status).toBe('offline');
  });
});
