// R37: editing happens in place on the page. No browser module or view opens a dialog or a new
// window; the compare board (R22, PR 23) will be the one window the app opens.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC_DIR = path.resolve(import.meta.dirname, '..', '..', 'src');

/** Calls and elements that open a dialog or a window. */
const DIALOG_PATTERNS: readonly RegExp[] = [
  /\b(alert|confirm|prompt)\s*\(/,
  /\bwindow\.open\s*\(/,
  /\.showModal\s*\(/,
  /<dialog\b/,
  /target="_blank"/,
];

/** Every source file under a folder of src/, with its text. */
async function readSources(folder: string): Promise<{ file: string; text: string }[]> {
  const entries = await readdir(path.join(SRC_DIR, folder), {
    recursive: true,
    withFileTypes: true,
  });
  const files = entries.filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name));
  return Promise.all(
    files.map(async (entry) => {
      const file = path.join(entry.parentPath, entry.name);
      return { file: path.relative(SRC_DIR, file), text: await readFile(file, 'utf8') };
    }),
  );
}

describe('R37: inline editing only', () => {
  it('R37: no page opens a modal dialog or a new window', async () => {
    const sources = [...(await readSources('client')), ...(await readSources('server/views'))];
    expect(sources.length).toBeGreaterThan(10);
    const offenders = sources.flatMap(({ file, text }) =>
      DIALOG_PATTERNS.filter((pattern) => pattern.test(text)).map(
        (pattern) => `${file}: ${String(pattern)}`,
      ),
    );
    expect(offenders).toEqual([]);
  });
});
