// Works out at launch whether setup has run and where the data folder is.
import { isDataFolderPresent, readDataSettings } from './data-folder.js';
import { readInstallFile } from './install-file.js';
import { resolveStoredPath } from './stored-path.js';

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
  const referenceDir =
    settings.referenceDir === undefined
      ? undefined
      : resolveStoredPath(homeDir, settings.referenceDir);
  return { kind: 'ready', dataDir, referenceDir };
}
