// First-run setup (R30): checks the two folders the user picked, then saves the choice.
import path from 'node:path';

import { createInbox, inspectReferenceFolder } from '#core/archive/originals.js';
import { AppError } from '#core/errors.js';

import { checkDataFolder, createDataFolder, updateDataSettings } from './data-folder.js';
import { refuseOverlappingFolders } from './folder-overlap.js';
import { DATA_WITH_APP, writeInstallFile } from './install-file.js';
import { toStoredPath } from './stored-path.js';

import type { InstallState } from './install-state.js';

/** The two places setup offers for the data folder. */
export type DataChoice = 'with-app' | 'chosen';

/** What the user entered on the setup page. */
export type SetupChoices = {
  readonly referenceDir: string;
  readonly dataChoice: DataChoice;
  readonly chosenDataDir: string | undefined;
};

/** Everything setup needs besides the user's choices. */
export type SetupRequest = {
  readonly homeDir: string;
  readonly port: number;
  readonly choices: SetupChoices;
};

/**
 * Returns the path trimmed, or refuses it if it isn't a full path. A relative path would
 * depend on where the app happened to start, so it is never accepted.
 */
export function requireFullPath(typed: string | undefined): string {
  // Windows' "Copy as path" wraps the path in quotes.
  const trimmed = (typed?.trim() ?? '').replace(/^"(.*)"$/, '$1').trim();
  if (trimmed === '' || !path.isAbsolute(trimmed)) {
    throw new AppError('invalid-input', 'Type the full path of the folder, like E:\\Reference.');
  }
  return path.resolve(trimmed);
}

/** Where the data folder will be for a choice: beside app\, or the folder the user typed. */
export function dataDirForChoice(homeDir: string, choices: SetupChoices): string {
  if (choices.dataChoice === 'with-app') {
    return path.join(homeDir, DATA_WITH_APP);
  }
  return requireFullPath(choices.chosenDataDir);
}

/**
 * Checks both folders again, then creates the data folder and the Inbox and saves the choice.
 * morgue-file.json is written last, so if any step fails the setup page simply shows again.
 */
export async function completeSetup(request: SetupRequest): Promise<InstallState> {
  const { homeDir, choices } = request;
  const referenceDir = requireFullPath(choices.referenceDir);
  await inspectReferenceFolder(referenceDir);
  const dataDir = dataDirForChoice(homeDir, choices);
  refuseOverlappingFolders({ homeDir, referenceDir, dataDir });
  await checkDataFolder(dataDir);

  await createDataFolder(dataDir);
  await updateDataSettings(dataDir, {
    port: request.port,
    referenceDir: toStoredPath(homeDir, referenceDir),
    referenceDirAbsolute: referenceDir,
  });
  await createInbox(referenceDir);
  await writeInstallFile(homeDir, {
    dataDir: choices.dataChoice === 'with-app' ? DATA_WITH_APP : dataDir,
  });
  return { kind: 'ready', dataDir, referenceDir };
}
