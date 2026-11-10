// A small Reference folder with one fixture file of each P0 format, made by the fixture
// generator, for scanner and thumbnail tests (the full archive takes minutes to make), and one of
// each P1 format (R7), which the planned archive doesn't use.
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { planFixtures } from '../../scripts/fixtures/plan.ts';
import { writeFixtureFile } from '../../scripts/fixtures/write.ts';

import type { FixtureFile } from '../../scripts/fixtures/fixture-file.ts';

/** The sample's paths, by what each one is. */
export type SampleArchive = {
  readonly referenceDir: string;
  readonly files: readonly FixtureFile[];
};

/** One planned entry of each P0 format: four image formats, MP4, MOV, PDF, CBZ, page folder. */
export function sampleOfEachFormat(): FixtureFile[] {
  const plan = planFixtures();
  const wanted = [/\.jpg$/, /\.png$/, /\.webp$/, /\.gif$/, /\.mp4$/, /\.mov$/, /\.pdf$/, /\.cbz$/];
  const sample = wanted.map((pattern) => plan.find((file) => pattern.test(file.relPath))!);
  return [...sample, plan.find((file) => file.kind === 'pagefolder')!];
}

/** The P1 formats (R7), each written as a planned P0 file would be under another extension. */
const P1_STAND_INS: readonly [RegExp, string][] = [
  [/\.jpg$/, '.heic'],
  [/\.png$/, '.tif'],
  [/\.webp$/, '.psd'],
  [/\.mp4$/, '.webm'],
];

/** One file of each P1 format: HEIC (a 2×2 grid of tiles, as iPhones save them), TIFF, PSD, WebM. */
export function sampleOfEachP1Format(): FixtureFile[] {
  const sample = sampleOfEachFormat();
  return P1_STAND_INS.map(([pattern, extension]) => {
    const file = sample.find((planned) => pattern.test(planned.relPath))!;
    return { ...file, relPath: file.relPath.replace(pattern, extension) };
  });
}

/** Writes one file of each P1 format into a new temp folder. */
export async function writeP1SampleArchive(): Promise<SampleArchive> {
  const referenceDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-p1-sample-'));
  const files = sampleOfEachP1Format();
  for (const file of files) {
    await writeFixtureFile(file, referenceDir);
  }
  return { referenceDir, files };
}

/**
 * Writes the sample into a new temp folder, plus a text file the archive should ignore and an
 * Inbox holding two numbered screenshots, which must stay photos rather than become a book.
 */
export async function writeSampleArchive(): Promise<SampleArchive> {
  const referenceDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-sample-'));
  const files = sampleOfEachFormat();
  for (const file of files) {
    await writeFixtureFile(file, referenceDir);
  }
  const screenshot = files.find((file) => file.relPath.endsWith('.png'))!;
  await writeFixtureFile({ ...screenshot, relPath: 'Inbox/2026-10/1.png' }, referenceDir);
  await writeFixtureFile({ ...screenshot, relPath: 'Inbox/2026-10/2.png' }, referenceDir);
  await writeFile(path.join(referenceDir, 'Figure', 'notes.txt'), 'Not a picture.');
  return { referenceDir, files };
}
