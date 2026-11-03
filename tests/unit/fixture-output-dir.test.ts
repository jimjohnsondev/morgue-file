import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { canClearOutputDir } from '../../scripts/fixtures/output-dir.ts';

describe('the fixture generator’s output folder', () => {
  it('may be the repo’s fixtures folder or the temp folder', () => {
    expect(canClearOutputDir(path.resolve(import.meta.dirname, '../../fixtures/generated'))).toBe(
      true,
    );
    expect(canClearOutputDir(path.join(tmpdir(), 'morgue-fixtures'))).toBe(true);
  });

  it('is refused anywhere else, so a real Reference folder is never cleared', () => {
    expect(canClearOutputDir(path.parse(process.cwd()).root)).toBe(false);
    expect(canClearOutputDir(homedir())).toBe(false);
    expect(canClearOutputDir(path.resolve(import.meta.dirname, '../..'))).toBe(false);
  });
});
