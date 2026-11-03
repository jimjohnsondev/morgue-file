import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { findMissingSections, REQUIRED_SECTIONS } from '../../scripts/check-readme.ts';

describe('R31: the README has every setup section', () => {
  it('R31: the repo README has all of them', async () => {
    const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');
    expect(findMissingSections(readme)).toEqual([]);
  });

  it('R31: the check fails when a required section is missing', () => {
    const headings = REQUIRED_SECTIONS.filter((section) => section !== 'Uninstall');
    const readme = headings.map((section) => `## ${section}\n\nText.\n`).join('\n');
    expect(findMissingSections(readme)).toEqual(['Uninstall']);
  });

  it('R31: a section only counts as its own heading, not a mention in the text', () => {
    const readme = '# Morgue File\n\nSee Troubleshooting below.\n\n### Uninstall\n';
    expect(findMissingSections(readme)).toContain('Troubleshooting');
    expect(findMissingSections(readme)).toContain('Uninstall');
  });
});
