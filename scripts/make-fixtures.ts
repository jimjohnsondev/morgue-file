// Makes the fixture archive every test runs on: the design brief's sample content as generated
// placeholder files (docs/ARCHITECTURE.md, Testing). Same bytes on every run. Usage:
//   node scripts/make-fixtures.ts [output folder, default fixtures/generated]
// It writes <output>/Reference/ and <output>/manifest.json (each file's size and SHA-256).
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import path from 'node:path';

import { canClearOutputDir } from './fixtures/output-dir.ts';
import { planFixtures } from './fixtures/plan.ts';
import { hashTree, runWithLimit, writeFixtureFile } from './fixtures/write.ts';

import type { FixtureFile } from './fixtures/fixture-file.ts';

const REPO_DIR = path.resolve(import.meta.dirname, '..');

/** ffmpeg is the heaviest writer, so only two encoders run at once. */
const VIDEO_LIMIT = 2;

/** Writes every planned file, then the manifest. */
async function makeFixtures(outputDir: string): Promise<void> {
  if (!canClearOutputDir(outputDir)) {
    throw new Error(
      `Refusing to clear ${outputDir}: use a folder under fixtures/ or the temp folder.`,
    );
  }
  const referenceDir = path.join(outputDir, 'Reference');
  await rm(referenceDir, { recursive: true, force: true });
  await mkdir(referenceDir, { recursive: true });
  const plan = planFixtures();
  const started = Date.now();
  let done = 0;
  function taskFor(file: FixtureFile): () => Promise<void> {
    return async () => {
      await writeFixtureFile(file, referenceDir);
      done += 1;
      if (done % 500 === 0 || done === plan.length) {
        console.info(`${String(done)} of ${String(plan.length)} written`);
      }
    };
  }
  const videos = plan.filter((file) => file.kind === 'video').map(taskFor);
  const others = plan.filter((file) => file.kind !== 'video').map(taskFor);
  await Promise.all([
    runWithLimit(videos, VIDEO_LIMIT),
    runWithLimit(others, Math.max(2, availableParallelism())),
  ]);
  const manifest = await hashTree(referenceDir);
  await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  const seconds = Math.round((Date.now() - started) / 1000);
  console.info(`Fixture archive ready in ${referenceDir} (${String(seconds)} s).`);
}

await makeFixtures(path.resolve(process.argv[2] ?? path.join(REPO_DIR, 'fixtures', 'generated')));
