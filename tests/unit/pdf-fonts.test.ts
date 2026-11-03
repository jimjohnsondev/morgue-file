import { describe, expect, it } from 'vitest';

import { STANDARD_FONTS_DIR } from '#core/jobs/workers/thumb-pdf.js';

describe('the PDF standard fonts folder', () => {
  it('R6: is written with forward slashes and ends in one, as pdf.js requires on Windows too', () => {
    expect(STANDARD_FONTS_DIR.endsWith('standard_fonts/')).toBe(true);
    expect(STANDARD_FONTS_DIR).not.toContain('\\');
  });
});
