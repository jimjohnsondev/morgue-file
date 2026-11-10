// Reads a backup zip sent from Settings (R26): saves the upload in the data folder, checks it is a
// zip Morgue File wrote, and takes out its library.db for the restore to check and put in place.
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { pipeline } from 'node:stream/promises';

import yauzl from 'yauzl';

import { AppError } from '#core/errors.js';

import { parseBackupInfo } from './backup-info.js';
import { INFO_ENTRY, LIBRARY_ENTRY } from './backup-zip.js';

import type { BackupInfo } from './backup-info.js';
import type { Readable } from 'node:stream';

/** The largest backup taken, zipped or not: a 50,000-item library is a small part of this. */
export const MAX_BACKUP_BYTES = 4 * 1024 ** 3;

/** The largest note a backup can hold; Morgue File's own is a few lines. */
const MAX_INFO_BYTES = 64 * 1024;

const NOT_A_BACKUP = 'That file is not a Morgue File backup. Choose a zip made by Back up now.';

/** The files a restore works with in the data folder, and how to delete them afterwards. */
export type RestoreFiles = {
  readonly zipFile: string;
  readonly databaseFile: string;
  readonly discard: () => Promise<void>;
};

/** Names the restore's working files in the data folder, so they sit on the library's drive. */
export function makeRestoreFiles(dataDir: string): RestoreFiles {
  const name = `restore-${randomUUID()}`;
  const zipFile = path.join(dataDir, `${name}.zip`);
  const databaseFile = path.join(dataDir, `${name}.db`);
  return {
    zipFile,
    databaseFile,
    discard: async () => {
      await rm(zipFile, { force: true });
      await rm(databaseFile, { force: true });
    },
  };
}

/** Passes bytes through until there are more than the limit, then fails as too large. */
function limitBytes(maxBytes: number): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      seen += chunk.length;
      if (seen > maxBytes) {
        done(new AppError('too-large', 'That backup is larger than any Morgue File library.'));
      } else {
        done(undefined, chunk);
      }
    },
  });
}

/** Writes a stream to a new file, refusing one over the size limit. */
export async function saveStream(
  content: NodeJS.ReadableStream,
  file: string,
  maxBytes = MAX_BACKUP_BYTES,
): Promise<void> {
  await pipeline(content, limitBytes(maxBytes), createWriteStream(file, { flags: 'wx' }));
}

/** Opens a zip, refusing a file that isn't one in the user's own words. */
async function openZip(zipFile: string): Promise<yauzl.ZipFile> {
  try {
    return await yauzl.openPromise(zipFile, { lazyEntries: true, autoClose: false });
  } catch {
    throw new AppError('invalid-backup', NOT_A_BACKUP);
  }
}

/** Reads one entry into memory, refusing one over the size limit. */
async function readEntry(zip: yauzl.ZipFile, entry: yauzl.Entry, maxBytes: number) {
  if (entry.uncompressedSize > maxBytes) {
    throw new AppError('invalid-backup', NOT_A_BACKUP);
  }
  return buffer(await zip.openReadStreamPromise(entry));
}

/** Writes one entry to a file, refusing one over the size limit. */
async function extractEntry(zip: yauzl.ZipFile, entry: yauzl.Entry, file: string) {
  if (entry.uncompressedSize > MAX_BACKUP_BYTES) {
    throw new AppError('too-large', 'That backup is larger than any Morgue File library.');
  }
  const content: Readable = await zip.openReadStreamPromise(entry);
  await saveStream(content, file);
}

/**
 * Checks a zip is a Morgue File backup, by its note, and writes its library.db to a file. Other
 * entries are ignored. Returns what the note says made the backup.
 */
export async function unpackBackup(zipFile: string, databaseFile: string): Promise<BackupInfo> {
  const zip = await openZip(zipFile);
  let info: BackupInfo | undefined;
  let hasLibrary = false;
  try {
    for await (const entry of zip.eachEntry()) {
      if (entry.fileName === INFO_ENTRY) {
        info = parseBackupInfo((await readEntry(zip, entry, MAX_INFO_BYTES)).toString('utf8'));
      } else if (entry.fileName === LIBRARY_ENTRY) {
        await extractEntry(zip, entry, databaseFile);
        hasLibrary = true;
      }
    }
  } catch (error) {
    // yauzl rejects a damaged zip only once it reaches the damage.
    throw error instanceof AppError ? error : new AppError('invalid-backup', NOT_A_BACKUP);
  } finally {
    zip.close();
  }
  if (info === undefined || !hasLibrary) {
    throw new AppError('invalid-backup', NOT_A_BACKUP);
  }
  return info;
}
