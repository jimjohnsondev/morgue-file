// Opens the library in a data folder: the database at its current schema, with root 1 pointing at
// the Reference folder.
import path from 'node:path';

import { purgeExpiredFields } from '#core/fields/fields.js';

import { LIBRARY_FILE_NAME, openDatabase } from './connection.js';
import { migrate } from './migrations.js';
import { setReferenceRoot } from './repositories/roots.js';

import type { Db } from './connection.js';

/** Where the library is and which app version is opening it (for backup names). */
export type OpenLibraryOptions = {
  readonly dataDir: string;
  readonly appVersion: string;
  /** The Reference folder from settings.json; root 1 is kept pointing at it. */
  readonly referenceDir?: string;
  readonly now?: Date;
};

/** The backups folder in the data folder, where migrations copy library.db first. */
export const BACKUPS_FOLDER_NAME = 'backups';

/**
 * Opens library.db in the data folder, runs pending migrations, deletes the fields removed more
 * than 30 days ago (R38), and points root 1 at the Reference folder. The path in settings.json
 * wins over the stored one, because that's where setup and the stored-path rules (R29) found the
 * folder at this launch.
 */
export function openLibrary(options: OpenLibraryOptions): Db {
  const db = openDatabase(path.join(options.dataDir, LIBRARY_FILE_NAME));
  try {
    const now = options.now ?? new Date();
    migrate(db, {
      backupsDir: path.join(options.dataDir, BACKUPS_FOLDER_NAME),
      appVersion: options.appVersion,
      now,
    });
    purgeExpiredFields(db, now);
    if (options.referenceDir !== undefined) {
      setReferenceRoot(db, options.referenceDir);
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
