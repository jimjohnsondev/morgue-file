import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deleteItemCacheFiles, thumbnailPath } from '#core/jobs/thumbnail-files.js';

let thumbsDir: string;

beforeEach(async () => {
  thumbsDir = await mkdtemp(path.join(os.tmpdir(), 'morgue-thumbs-'));
});

afterEach(async () => {
  await rm(thumbsDir, { recursive: true, force: true });
});

describe("clearing an item's cached files before its thumbnail is made again", () => {
  it('R6: deletes the other sizes and viewer copy of that item, keeping the new default', async () => {
    // Item 287 and item 31 share the cache folder 1f (287 mod 256 = 31); 2870 starts alike.
    const folder = path.dirname(thumbnailPath(thumbsDir, 287, { width: 320, height: 320 }));
    await mkdir(folder, { recursive: true });
    for (const name of ['287-320.webp', '287-480.webp', '287-view.jpg', '31-320.webp']) {
      await writeFile(path.join(folder, name), name);
    }
    await deleteItemCacheFiles(thumbsDir, 287, path.join(folder, '287-320.webp'));
    expect((await readdir(folder)).sort()).toEqual(['287-320.webp', '31-320.webp']);
  });

  it('does nothing when the item has never had a cache folder', async () => {
    await expect(deleteItemCacheFiles(thumbsDir, 5)).resolves.toBeUndefined();
  });
});
