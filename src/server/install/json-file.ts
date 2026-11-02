// Reads and writes the app's small JSON files, checking their shape so a hand-edited file
// can't put an unexpected value into the app.
import { readFile, rename, writeFile } from 'node:fs/promises';

import { Value } from '@sinclair/typebox/value';

import { AppError, systemErrorCode } from '#core/errors.js';

import type { Static, TSchema } from '@sinclair/typebox';

/** Reads a JSON file and checks it against a schema. Returns undefined when the file is absent. */
export async function readJsonFile<Schema extends TSchema>(
  filePath: string,
  schema: Schema,
): Promise<Static<Schema> | undefined> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (systemErrorCode(error) === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
  const parsed: unknown = parseJson(text);
  if (!Value.Check(schema, parsed)) {
    throw new AppError('invalid-install-file', `${filePath} isn't in the expected format.`);
  }
  return parsed;
}

/** Parses JSON, turning a syntax error into the same refusal as a file of the wrong shape. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Treated like any other malformed file: the caller reports which file it was.
    return undefined;
  }
}

/**
 * Writes a JSON file through a temporary file and a rename, so a crash or a full disk never
 * leaves a half-written settings file behind.
 */
export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, undefined, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}
