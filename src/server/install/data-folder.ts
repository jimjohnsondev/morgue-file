// The data folder: checking it can be written, creating it, and its settings.json.
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Type } from '@sinclair/typebox';

import { LIBRARY_FILE_NAME } from '#core/db/connection.js';
import { AppError } from '#core/errors.js';

import { readJsonFile, writeJsonFile } from './json-file.js';

const SETTINGS_FILE_NAME = 'settings.json';
const WRITE_TEST_FILE_NAME = '.morgue-file-write-test';

const DataSettingsSchema = Type.Object({
  port: Type.Optional(Type.Integer({ minimum: 1, maximum: 65535 })),
  referenceDir: Type.Optional(Type.String({ minLength: 1 })),
  referenceDirAbsolute: Type.Optional(Type.String({ minLength: 1 })),
});

/**
 * Launch settings kept in the data folder: the port the server last got, and the Reference
 * folder twice: relative to the home folder when it's on the same drive (so a USB drive works
 * under a new letter), and absolute (so the app folder can move on its own).
 */
export type DataSettings = {
  readonly port?: number;
  readonly referenceDir?: string;
  readonly referenceDirAbsolute?: string;
};

/** What setup's Check reports about a data folder. */
export type DataFolderCheck = {
  readonly hasLibrary: boolean;
};

/** Says whether a path exists. */
async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    // A missing or unreachable path both mean "not there" to the caller.
    return false;
  }
}

/**
 * Confirms the app can create the folder and write a file in it, and says whether it already
 * holds a library. Anything the check created is removed again (R30).
 */
export async function checkDataFolder(dataDir: string): Promise<DataFolderCheck> {
  let firstCreated: string | undefined;
  try {
    firstCreated = await mkdir(dataDir, { recursive: true });
    const testFile = path.join(dataDir, WRITE_TEST_FILE_NAME);
    await writeFile(testFile, 'Morgue File checks it can write here.');
    await rm(testFile);
  } catch {
    throw new AppError(
      'folder-unwritable',
      `Morgue File can't create or write files in ${dataDir}. Choose a folder you can save files in.`,
    );
  } finally {
    if (firstCreated !== undefined) {
      await rm(firstCreated, { recursive: true, force: true });
    }
  }
  return { hasLibrary: await pathExists(path.join(dataDir, LIBRARY_FILE_NAME)) };
}

/** Creates the data folder if it isn't there. An existing library in it is left as it is. */
export async function createDataFolder(dataDir: string): Promise<void> {
  await mkdir(dataDir, { recursive: true });
}

/** Says whether the data folder is there, for the launch check that finds an unplugged drive. */
export async function isDataFolderPresent(dataDir: string): Promise<boolean> {
  return pathExists(dataDir);
}

/** Reads settings.json, or empty settings for a new data folder. */
export async function readDataSettings(dataDir: string): Promise<DataSettings> {
  return (await readJsonFile(path.join(dataDir, SETTINGS_FILE_NAME), DataSettingsSchema)) ?? {};
}

/** Merges new values into settings.json, keeping any others already saved there. */
export async function updateDataSettings(dataDir: string, changes: DataSettings): Promise<void> {
  const current = await readDataSettings(dataDir);
  await writeJsonFile(path.join(dataDir, SETTINGS_FILE_NAME), { ...current, ...changes });
}
