// The fixture archive as a list of files to make, before anything is written. The names, counts
// and dates come from the Sample content table in docs/DESIGN-BRIEF.md and from the mocks.
import { planLibrary } from './library.ts';
import { planPhotos } from './photos.ts';
import { planVideos } from './videos.ts';

import type { FixtureFile } from './fixture-file.ts';

/** Every fixture file, in a fixed order. */
export function planFixtures(): readonly FixtureFile[] {
  return [...planPhotos(), ...planVideos(), ...planLibrary()];
}
