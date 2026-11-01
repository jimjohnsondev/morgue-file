// What every page route needs from the app: the launch token and the built asset URLs.
import type { PageAssets } from '../assets.js';

/** Shared values page routes pass to the layout. */
export type PageContext = {
  readonly token: string;
  readonly assets: PageAssets;
};
