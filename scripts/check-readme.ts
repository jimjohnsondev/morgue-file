// Fails if README.md is missing a section the user manual must have (R31, docs/ARCHITECTURE.md).
// Run by CI and by npm run check: node scripts/check-readme.ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The README's required second-level headings, in the order the architecture lists them. */
export const REQUIRED_SECTIONS = [
  'What it is',
  'Requirements',
  'Install',
  'First run',
  'Everyday use',
  'Update',
  'Move or back up',
  'Uninstall',
  'Troubleshooting',
  'For developers',
] as const;

/** Returns the required sections that have no `## ` heading of their own in the markdown. */
export function findMissingSections(markdown: string): string[] {
  const headings = new Set(
    markdown
      .split(/\r?\n/)
      .filter((line) => line.startsWith('## '))
      .map((line) => line.slice(3).trim()),
  );
  return REQUIRED_SECTIONS.filter((section) => !headings.has(section));
}

/** Checks the repo's README and sets a failing exit code if any section is missing. */
function checkReadme(): void {
  const readmePath = path.resolve(import.meta.dirname, '..', 'README.md');
  const missing = findMissingSections(readFileSync(readmePath, 'utf8'));
  if (missing.length > 0) {
    console.error(`README.md is missing these sections: ${missing.join(', ')}.`);
    process.exitCode = 1;
    return;
  }
  console.info('README.md has every required section.');
}

// Run only when started as a script, not when a test imports findMissingSections.
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  checkReadme();
}
