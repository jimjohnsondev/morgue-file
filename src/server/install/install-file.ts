// morgue-file.json, beside Morgue File.cmd: the one file that says where the data folder is.
import path from 'node:path';

import { Type } from '@sinclair/typebox';

import { readJsonFile, writeJsonFile } from './json-file.js';

/** The file's name. The release zip never contains it, so an update keeps the user's choice. */
export const INSTALL_FILE_NAME = 'morgue-file.json';

/** The saved dataDir for the default choice, "Keep data with the app": a folder beside app\. */
export const DATA_WITH_APP = 'data';

const InstallFileSchema = Type.Object({ dataDir: Type.String({ minLength: 1 }) });

/** What morgue-file.json holds: "data", or the absolute path of a folder the user chose. */
export type InstallFile = {
  readonly dataDir: string;
};

/** Reads morgue-file.json from the home folder. Undefined means setup hasn't run yet. */
export async function readInstallFile(homeDir: string): Promise<InstallFile | undefined> {
  return readJsonFile(path.join(homeDir, INSTALL_FILE_NAME), InstallFileSchema);
}

/** Saves morgue-file.json. Setup writes it last, so a failed setup simply runs again. */
export async function writeInstallFile(homeDir: string, file: InstallFile): Promise<void> {
  await writeJsonFile(path.join(homeDir, INSTALL_FILE_NAME), file);
}
