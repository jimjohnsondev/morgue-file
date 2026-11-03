import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveOriginalPath } from '#core/archive/originals.js';

const root = path.resolve('reference-root');

describe('resolving an item path under its root', () => {
  it('joins a relative path with forward slashes onto the root', () => {
    expect(resolveOriginalPath(root, 'Video/Poses/a.mp4')).toBe(
      path.join(root, 'Video', 'Poses', 'a.mp4'),
    );
  });

  it('allows names that merely start with two dots', () => {
    expect(resolveOriginalPath(root, '..notes.jpg')).toBe(path.join(root, '..notes.jpg'));
  });

  it('refuses paths that leave the root', () => {
    for (const relPath of [
      '../secret.jpg',
      'Figure/../../secret.jpg',
      path.resolve('/elsewhere'),
    ]) {
      expect(() => resolveOriginalPath(root, relPath)).toThrow(/outside the Reference folder/);
    }
  });
});
