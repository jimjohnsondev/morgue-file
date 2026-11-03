// Pages and media need the open library; before setup, or if it failed to open, they refuse.
import { AppError } from '#core/errors.js';

import type { LibraryRuntime, OpenLibrary } from '../library-runtime.js';

/** Returns the open library, or refuses the request while there is none. */
export function requireLibrary(library: LibraryRuntime | undefined): OpenLibrary {
  const open = library?.open();
  if (open === undefined) {
    throw new AppError('library-unavailable', 'The library is not open yet.');
  }
  return open;
}
