// Works out at launch whether setup has run and where the data folder is.
import { isReferenceFolderPresent } from '#core/archive/originals.js';

import { isDataFolderPresent, readDataSettings } from './data-folder.js';
import { readInstallFile } from './install-file.js';
import { resolveStoredPath } from './stored-path.js';

import type { DataSettings } from './data-folder.js';

/**
 * Where the app stands: not set up yet, set up but the data folder can't be found (an unplugged
 * drive, say), or ready to serve the archive.
 */
export type InstallState =
  | { readonly kind: 'needs-setup' }
  | { readonly kind: 'data-missing'; readonly dataDir: string }
  | { readonly kind: 'ready'; readonly dataDir: string; readonly referenceDir: string | undefined };

/** The current install state. Setup replaces it when it finishes, without a restart. */
export type InstallStateHolder = {
  current: InstallState;
};

/** Reads morgue-file.json and the data folder's settings from the home folder. */
export async function loadInstallState(homeDir: string): Promise<InstallState> {
  const installFile = await readInstallFile(homeDir);
  if (installFile === undefined) {
    return { kind: 'needs-setup' };
  }
  const dataDir = resolveStoredPath(homeDir, installFile.dataDir);
  if (!(await isDataFolderPresent(dataDir))) {
    return { kind: 'data-missing', dataDir };
  }
  const settings = await readDataSettings(dataDir);
  return { kind: 'ready', dataDir, referenceDir: await findReferenceFolder(homeDir, settings) };
}

/**
 * Picks where the Reference folder is now: its absolute path if that's there (the app folder
 * moved on its own), else its path relative to the app (the whole drive got a new letter), else
 * the absolute path, which shows as offline until the drive is back (R29).
 */
async function findReferenceFolder(
  homeDir: string,
  settings: DataSettings,
): Promise<string | undefined> {
  const candidates = [settings.referenceDirAbsolute, settings.referenceDir]
    .filter((stored) => stored !== undefined)
    .map((stored) => resolveStoredPath(homeDir, stored));
  for (const folder of candidates) {
    if (await isReferenceFolderPresent(folder)) {
      return folder;
    }
  }
  return candidates[0];
}
