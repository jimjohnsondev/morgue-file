// R37: editing happens in place on the page. No browser module or view opens a dialog or a new
// window, except the compare board's own window (R22), which only client/compare.ts opens.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC_DIR = path.resolve(import.meta.dirname, '..', '..', 'src');

/** The one module allowed to open a window: the compare board's (R22). */
const COMPARE_WINDOW_MODULE = path.join('client', 'compare.ts');

const WINDOW_OPEN = /\bwindow\.open\s*\(/;

/** Calls and elements that open a dialog or a window. */
const DIALOG_PATTERNS: readonly RegExp[] = [
  /\b(alert|confirm|prompt)\s*\(/,
  WINDOW_OPEN,
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
      DIALOG_PATTERNS.filter((pattern) => pattern.test(text))
        .filter((pattern) => !(pattern === WINDOW_OPEN && file === COMPARE_WINDOW_MODULE))
        .map((pattern) => `${file}: ${String(pattern)}`),
    );
    expect(offenders).toEqual([]);
  });

  it('R22: the compare board opens one named window, and only from client/compare.ts', async () => {
    const compare = await readFile(path.join(SRC_DIR, COMPARE_WINDOW_MODULE), 'utf8');
    expect(compare.match(/\bwindow\.open\(/g)).toHaveLength(1);
    expect(compare).toContain("window.open('/compare', BOARD_WINDOW_NAME");
  });
});
