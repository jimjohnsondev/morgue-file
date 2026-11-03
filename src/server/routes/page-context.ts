// What every page route needs from the app: the launch token, the built asset URLs, and the
// library once it is open.
import type { PageAssets } from '../assets.js';
import type { LibraryRuntime } from '../library-runtime.js';

/** Shared values page routes pass to the layout. */
export type PageContext = {
  readonly token: string;
  readonly assets: PageAssets;
  /** Absent in tests that only check the frame; pages that list items then refuse. */
  readonly library?: LibraryRuntime | undefined;
};
