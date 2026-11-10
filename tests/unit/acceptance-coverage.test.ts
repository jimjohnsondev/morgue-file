// The 1.0 milestone check (Build plan row 25): every P0 and P1 row in docs/PRD.md has at least one
// acceptance test named after it, so "every P0 and P1 acceptance test passes" covers every row.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_DIR = path.resolve(import.meta.dirname, '..', '..');

/** One row of the PRD's Feature requirements table. */
type PrdRow = { readonly id: string; readonly priority: string };

/** Reads the requirement number and priority from each row of the Feature requirements table. */
function parsePrdRows(markdown: string): PrdRow[] {
  const rows: PrdRow[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const cells = line.split('|').map((cell) => cell.trim());
    const [, number, , , priority] = cells;
    if (number !== undefined && /^\d+$/.test(number) && priority !== undefined) {
      rows.push({ id: `R${number}`, priority });
    }
  }
  return rows;
}

/** Lists every test file under tests/, at any depth. */
async function listTestFiles(): Promise<string[]> {
  const entries = await readdir(path.join(REPO_DIR, 'tests'), {
    recursive: true,
    withFileTypes: true,
  });
  return (
    entries
      .filter((entry) => entry.isFile() && /\.(test|spec)\.tsx?$/.test(entry.name))
      // This file names rows in its own comments and samples; it tests none of them.
      .filter((entry) => entry.name !== path.basename(import.meta.filename))
      .map((entry) => path.join(entry.parentPath, entry.name))
  );
}

/** Collects the row ids that open a test or describe title, a quoted `R<n>:` right after `(`. */
async function findNamedRows(files: readonly string[]): Promise<Set<string>> {
  const named = new Set<string>();
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/\(\s*['"`](R\d+):/g)) {
      named.add(match[1]!);
    }
  }
  return named;
}

describe('the 1.0 milestone: every P0 and P1 row has an acceptance test', () => {
  it('reads the PRD table, with every row from R1 to R38 and a priority for each', async () => {
    const rows = parsePrdRows(await readFile(path.join(REPO_DIR, 'docs', 'PRD.md'), 'utf8'));
    expect(rows.map((row) => row.id)).toEqual(
      Array.from({ length: 38 }, (_, index) => `R${String(index + 1)}`),
    );
    expect(rows.every((row) => ['P0', 'P1', 'P2'].includes(row.priority))).toBe(true);
  });

  it('finds a test named after every P0 and P1 row', async () => {
    const rows = parsePrdRows(await readFile(path.join(REPO_DIR, 'docs', 'PRD.md'), 'utf8'));
    const named = await findNamedRows(await listTestFiles());
    const untested = rows
      .filter((row) => row.priority !== 'P2' && !named.has(row.id))
      .map((row) => row.id);
    expect(untested).toEqual([]);
  });
});
