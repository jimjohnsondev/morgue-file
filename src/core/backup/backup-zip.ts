// Settings' "Back up now" (R26): the whole library as a zip of a consistent copy of library.db,
// with a short note saying which app and schema made it.
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';

import yazl from 'yazl';

import { backUpDatabase, readSchemaVersion } from '#core/db/repositories/schema.js';

import type { Db } from '#core/db/connection.js';
import type { BackupInfo } from './backup-info.js';

/** A backup being written: the name to save it as, its bytes, and how to tidy up after. */
export type BackupZip = {
  readonly fileName: string;
  readonly content: NodeJS.ReadableStream;
  /** Deletes the database copy the zip is read from, once it has been sent or abandoned. */
  readonly discard: () => Promise<void>;
};

/** What a backup needs besides the library: where to put its copy, and what to record. */
export type BackupOptions = {
  readonly dataDir: string;
  readonly appVersion: string;
  readonly now: Date;
};

/** The zip entry holding the library, and the one saying what made it. */
export const LIBRARY_ENTRY = 'library.db';
export const INFO_ENTRY = 'morgue-file-backup.json';

/** Names a backup by the UTC time it was made, as the migration backups are named. */
function backupFileName(now: Date): string {
  const stamp = now.toISOString().slice(0, 19).replaceAll(':', '-');
  return `MorgueFile-backup-${stamp}Z.zip`;
}

/**
 * Copies the library with `VACUUM INTO` (which takes in what is still in the WAL) into the data
 * folder, and returns a zip of that copy, written as it is read. Tags, collections, subcategories,
 * fields, notes, model profiles and settings are all in library.db; the originals and thumbnails
 * are not, so a backup stays small.
 */
export function makeBackupZip(db: Db, options: BackupOptions): BackupZip {
  const copy = path.join(options.dataDir, `backup-${randomUUID()}.db`);
  backUpDatabase(db, copy);
  const info: BackupInfo = {
    app: 'morgue-file',
    appVersion: options.appVersion,
    schemaVersion: readSchemaVersion(db),
    madeAt: options.now.toISOString(),
  };
  const zip = new yazl.ZipFile();
  zip.addBuffer(Buffer.from(`${JSON.stringify(info, undefined, 2)}\n`), INFO_ENTRY, {
    mtime: options.now,
  });
  zip.addFile(copy, LIBRARY_ENTRY, { mtime: options.now });
  zip.end();
  return {
    fileName: backupFileName(options.now),
    content: zip.outputStream,
    discard: () => rm(copy, { force: true }),
  };
}
