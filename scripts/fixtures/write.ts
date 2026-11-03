// Writes planned fixture files to disk, a few at a time, and stamps each with its planned time.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { figureSvg, IMAGE_FORMATS, type ImageFormat, renderSvg } from './draw.ts';
import { type Publication, writeCbz, writePageFolder, writePdf } from './publications.ts';
import { createRandom, hashText, type Random } from './random.ts';
import { encodeClip } from './video.ts';

import type { FixtureFile, FixtureKind } from './fixture-file.ts';

/** One line of the manifest: a file under the Reference folder and its content hash. */
export type ManifestEntry = {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
};

/** Where and how to write one planned file. */
type Target = { readonly file: FixtureFile; readonly outputPath: string; readonly random: Random };

/** The writer for each kind of fixture entry. */
const WRITERS: Record<FixtureKind, (target: Target) => Promise<void>> = {
  image: writeImage,
  video: writeVideo,
  pdf: async (target) => writePdf(publicationFor(target)),
  cbz: async (target) => writeCbz(publicationFor(target)),
  pagefolder: async (target) => writePageFolder(publicationFor(target)),
};

/** Writes one planned file (or page folder) under the Reference folder. */
export async function writeFixtureFile(file: FixtureFile, referenceDir: string): Promise<void> {
  const outputPath = path.join(referenceDir, ...file.relPath.split('/'));
  await mkdir(path.dirname(outputPath), { recursive: true });
  const random = createRandom(hashText(file.relPath));
  await WRITERS[file.kind]({ file, outputPath, random });
  await stampTime(outputPath, file.mtimeMs);
}

/** Draws an image in the format its extension names. */
async function writeImage({ file, outputPath, random }: Target): Promise<void> {
  const picture = { width: file.width ?? 1, height: file.height ?? 1, random };
  const format = imageFormatOf(file.relPath);
  await writeFile(outputPath, await renderSvg(figureSvg(picture), format));
}

/** The image format a file's extension names, or an error for one the generator can't write. */
function imageFormatOf(relPath: string): ImageFormat {
  const extension = path.extname(relPath).slice(1);
  const format = IMAGE_FORMATS.find((candidate) => candidate === extension);
  if (format === undefined) {
    throw new Error(`No image writer for ${relPath}.`);
  }
  return format;
}

/** Encodes a video at its planned size, rate and length. */
async function writeVideo({ file, outputPath, random }: Target): Promise<void> {
  const clip = {
    width: file.width ?? 640,
    height: file.height ?? 360,
    fps: file.fps ?? 30,
    durationSeconds: file.durationSeconds ?? 2,
    outputPath,
  };
  await encodeClip(clip, random);
}

/** The title, page count and output path of a publication. */
function publicationFor({ file, outputPath, random }: Target): Publication {
  return { title: file.title ?? '', pageCount: file.pageCount ?? 1, outputPath, random };
}

/** Sets a file's times, or a page folder's and every page's in it. */
async function stampTime(outputPath: string, mtimeMs: number): Promise<void> {
  const time = new Date(mtimeMs);
  if ((await stat(outputPath)).isDirectory()) {
    for (const name of await readdir(outputPath)) {
      await utimes(path.join(outputPath, name), time, time);
    }
  }
  await utimes(outputPath, time, time);
}

/** Runs tasks with at most `limit` running at once, in the order given. */
export async function runWithLimit(
  tasks: readonly (() => Promise<void>)[],
  limit: number,
): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    while (next < tasks.length) {
      const task = tasks[next];
      next += 1;
      await task?.();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

/** Lists every file under a folder with its size and SHA-256, sorted by path. */
export async function hashTree(rootDir: string): Promise<ManifestEntry[]> {
  const entries: ManifestEntry[] = [];
  const names = await readdir(rootDir, { recursive: true, withFileTypes: true });
  for (const entry of names) {
    if (!entry.isFile()) {
      continue;
    }
    const fullPath = path.join(entry.parentPath, entry.name);
    const bytes = await readFile(fullPath);
    entries.push({
      path: path.relative(rootDir, fullPath).split(path.sep).join('/'),
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  return entries.sort((left, right) => (left.path < right.path ? -1 : 1));
}
