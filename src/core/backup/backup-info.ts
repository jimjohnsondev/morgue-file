// The note inside every backup zip saying which app and schema made it (R26).
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

import type { Static } from '@sinclair/typebox';

/** The note's shape. A restore reads it before the library, to refuse other apps' zips. */
export const BackupInfoSchema = Type.Object({
  app: Type.Literal('morgue-file'),
  appVersion: Type.String(),
  schemaVersion: Type.Integer({ minimum: 1 }),
  madeAt: Type.String(),
});

/** What made a backup and when. */
export type BackupInfo = Static<typeof BackupInfoSchema>;

/** Reads a backup's note, or returns undefined if it isn't one Morgue File wrote. */
export function parseBackupInfo(text: string): BackupInfo | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not JSON at all: the caller refuses the zip as it would a missing note.
    return undefined;
  }
  return Value.Check(BackupInfoSchema, parsed) ? parsed : undefined;
}
