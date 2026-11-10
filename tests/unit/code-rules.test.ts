// R32 and R33: the lint gate really blocks what docs/STYLE.md rules out. Each sample is linted
// with the repo's own eslint.config.js, so loosening a limit there fails a test here.
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

const REPO_DIR = path.resolve(import.meta.dirname, '..', '..');

// The samples aren't files in the TypeScript project, so they are linted without type
// information. Every rule these tests check works without it.
const eslint = new ESLint({
  cwd: REPO_DIR,
  overrideConfig: [{ files: ['**/*.ts', '**/*.tsx'], ...tseslint.configs.disableTypeChecked }],
});

/** Lints a sample as if it were a file at `filePath`, and returns the rules it broke. */
async function brokenRules(
  source: string,
  filePath = 'src/core/lint-sample.ts',
): Promise<string[]> {
  const [result] = await eslint.lintText(source, { filePath });
  return (result?.messages ?? []).map((message) => message.ruleId ?? message.message);
}

/** Body lines for documentedFunction that make it `count` counted lines long in all. */
function bodyOfLength(count: number): string[] {
  return Array.from({ length: count - 3 }, () => '  flag += 1;');
}

/** A documented exported function whose body is the given lines. */
function documentedFunction(bodyLines: readonly string[]): string {
  return `// Sample.\n/** Sample. */\nexport function sample(flag: number): number {\n${bodyLines.join('\n')}\n  return flag;\n}\n`;
}

describe('R32: lint limits on function length, file length, complexity and nesting', () => {
  it('R32: a clean sample passes, so the samples below fail only for what they show', async () => {
    expect(await brokenRules(documentedFunction(['  flag += 1;']))).toEqual([]);
  });

  // documentedFunction adds three counted lines to its body: the signature, return and brace.
  it('R32: a function of 40 lines passes and one of 41 fails', async () => {
    expect(await brokenRules(documentedFunction(bodyOfLength(40)))).toEqual([]);
    expect(await brokenRules(documentedFunction(bodyOfLength(41)))).toContain(
      'max-lines-per-function',
    );
  });

  it('R32: a file of 300 lines passes and one of 301 fails', async () => {
    // Three counted lines per function, as comments and blank lines aren't counted: 300 in all.
    const functions = Array.from(
      { length: 100 },
      (_, index) =>
        `/** Sample. */\nexport function sample${String(index)}(): number {\n  return ${String(index)};\n}\n`,
    );
    const file = `// Sample.\n${functions.join('\n')}`;
    expect(await brokenRules(file)).toEqual([]);
    expect(await brokenRules(`${file}export const lastLine = 1;\n`)).toContain('max-lines');
  });

  it('R32: a function with complexity over 10 fails', async () => {
    const lines = Array.from(
      { length: 10 },
      (_, index) => `  if (flag === ${String(index)}) flag += 1;`,
    );
    expect(await brokenRules(documentedFunction(lines))).toContain('complexity');
  });

  it('R32: nesting deeper than 3 levels fails', async () => {
    const lines = ['  if (flag) {', '    if (flag) {', '      if (flag) {', '        if (flag) {'];
    const closing = ['        }', '      }', '    }', '  }'];
    expect(await brokenRules(documentedFunction([...lines, '  flag += 1;', ...closing]))).toContain(
      'max-depth',
    );
  });

  it('R32: an exported function without a doc comment fails', async () => {
    const source = '// Sample.\nexport function sample(): number {\n  return 1;\n}\n';
    expect(await brokenRules(source)).toContain('jsdoc/require-jsdoc');
  });

  it('R32: the repo holds no generated or minified code', async () => {
    const { stdout } = await promisify(execFile)('git', ['ls-files'], { cwd: REPO_DIR });
    const generated = stdout
      .split('\n')
      .filter((file) => /(^|\/)dist\/|\.min\.(js|css)$|^fixtures\/generated\//.test(file));
    expect(generated).toEqual([]);
  });
});

describe('R33: one code style, enforced by the formatter and linter', () => {
  it.each([
    ['an enum', 'export enum Kind { Photo }', 'no-restricted-syntax'],
    ['an interface', 'export interface Kind { name: string }', 'no-restricted-syntax'],
    ['a class', 'export class Kind {}', 'no-restricted-syntax'],
    ['a .then() chain', 'void Promise.resolve(1).then(() => 2);', 'no-restricted-syntax'],
    ['forEach', '[1].forEach(() => 2);', 'no-restricted-syntax'],
    ['any', 'export let kind: any = 1;', 'no-restricted-syntax'],
    ['a default export', 'export default 1;', 'import-x/no-default-export'],
    ['a built-in without node:', "import 'path';", 'no-restricted-syntax'],
    [
      'an arrow function for a named function',
      'export const kind = (): number => 1;',
      'func-style',
    ],
  ])('R33: lint blocks %s', async (_name, line, rule) => {
    expect(await brokenRules(`// Sample.\n/** Sample. */\n${line}\n`)).toContain(rule);
  });

  it('R33: npm run check runs the formatter check and lint with zero warnings allowed', async () => {
    const manifest = JSON.parse(await readFile(path.join(REPO_DIR, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(manifest.scripts.check).toContain('npm run format:check');
    expect(manifest.scripts.check).toContain('npm run lint');
    expect(manifest.scripts['format:check']).toBe('prettier --check .');
    expect(manifest.scripts.lint).toContain('eslint . --max-warnings 0');
  });
});
