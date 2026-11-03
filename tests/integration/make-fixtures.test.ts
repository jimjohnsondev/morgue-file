import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { hslToHex } from '../../scripts/fixtures/draw.ts';
import { planFixtures } from '../../scripts/fixtures/plan.ts';
import { hashTree, writeFixtureFile } from '../../scripts/fixtures/write.ts';

import type { FixtureFile } from '../../scripts/fixtures/fixture-file.ts';

const plan = planFixtures();
const tempDirs: string[] = [];

/** One planned entry of each kind and image format, small ones only. */
function sampleOfEachFormat(): FixtureFile[] {
  const wanted = [/\.jpg$/, /\.png$/, /\.webp$/, /\.gif$/, /\.mp4$/, /\.mov$/, /\.pdf$/, /\.cbz$/];
  const sample = wanted.map((pattern) => plan.find((file) => pattern.test(file.relPath))!);
  return [...sample, plan.find((file) => file.kind === 'pagefolder')!];
}

/** Writes the sample into a new temp folder and returns its manifest. */
async function writeSample(): Promise<Awaited<ReturnType<typeof hashTree>>> {
  const referenceDir = await mkdtemp(path.join(tmpdir(), 'morgue-fixtures-'));
  tempDirs.push(referenceDir);
  for (const file of sampleOfEachFormat()) {
    await writeFixtureFile(file, referenceDir);
  }
  return hashTree(referenceDir);
}

afterAll(async () => {
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe('fixture writers', () => {
  it('write every format, with the same bytes on every run', async () => {
    const first = await writeSample();
    const second = await writeSample();
    expect(second).toEqual(first);
    const extensions = new Set(first.map((entry) => path.extname(entry.path)));
    expect([...extensions].sort()).toEqual(
      ['.cbz', '.gif', '.jpg', '.mov', '.mp4', '.pdf', '.png', '.webp'].sort(),
    );
  }, 120_000);

  it('convert the mocks’ HSL colors to hex', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000');
    expect(hslToHex(30, 18, 70)).toBe('#c0b3a5');
  });
});
