import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveStoredPath, toStoredPath } from '#server/install/stored-path.js';

const HOME = 'E:\\Apps\\Morgue File';

describe('R29: folder paths survive a changed drive letter', () => {
  it('R29: stores a folder on the same drive relative to the app', () => {
    expect(toStoredPath(HOME, 'E:\\Reference', path.win32)).toBe('..\\..\\Reference');
    expect(toStoredPath(HOME, 'e:\\Apps\\Morgue File\\data', path.win32)).toBe('data');
  });

  it('R29: resolves it under whatever letter the drive has now', () => {
    const stored = toStoredPath(HOME, 'E:\\Reference', path.win32);
    expect(resolveStoredPath('F:\\Apps\\Morgue File', stored, path.win32)).toBe('F:\\Reference');
  });

  it('R29: stores a folder on another drive as an absolute path', () => {
    expect(toStoredPath(HOME, 'D:\\Reference tést', path.win32)).toBe('D:\\Reference tést');
    expect(resolveStoredPath(HOME, 'D:\\Reference tést', path.win32)).toBe('D:\\Reference tést');
  });
});
