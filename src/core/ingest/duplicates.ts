// Recognizes a dropped file the archive already has (R8), so re-importing it links to the item
// it was found as rather than copying it. Only items of the same kind and size are looked at;
// their partial hashes are compared next, and the full hash is read only to confirm a match.
import { readFullHash, readPartialHash, statOriginal } from '#core/archive/originals.js';
import { findCopyCandidates } from '#core/db/repositories/item-files.js';

import type { FileKind } from '#core/archive/classify.js';
import type { Db } from '#core/db/connection.js';
import type { CopyCandidate } from '#core/db/repositories/item-files.js';

/** A file received into the Inbox and not yet kept: where it is, and what kind it is. */
export type ReceivedFile = {
  readonly rootPath: string;
  readonly relPath: string;
  readonly kind: FileKind;
};

/**
 * A candidate's partial hash: the stored one, or read now for an item whose thumbnail job
 * hasn't stored it yet (a file dropped twice in a row). Undefined if the file can't be read.
 */
async function readCandidatePartialHash(candidate: CopyCandidate): Promise<string | undefined> {
  try {
    return candidate.partialHash ?? (await readPartialHash(candidate.rootPath, candidate.relPath));
  } catch {
    // Gone or unreadable since its last scan: it can't be confirmed, so it isn't the copy.
    return undefined;
  }
}

/**
 * Reads a candidate's full hash now, never a stored one, so a file edited since its last scan is
 * never taken for the dropped file's twin. Undefined if the file can't be read.
 */
async function readCandidateFullHash(candidate: CopyCandidate): Promise<string | undefined> {
  try {
    return await readFullHash(candidate.rootPath, candidate.relPath);
  } catch {
    // Gone or unreadable since its last scan: it can't be confirmed, so it isn't the copy.
    return undefined;
  }
}

/**
 * Returns the id of the item a received file is a copy of, or undefined if it is new. A file
 * that isn't there now, or is on an offline root, can't be compared and never matches.
 */
export async function findKeptCopy(db: Db, received: ReceivedFile): Promise<number | undefined> {
  const { size } = await statOriginal(received.rootPath, received.relPath);
  const candidates = findCopyCandidates(db, { kind: received.kind, size });
  if (candidates.length === 0) {
    return undefined;
  }
  const partialHash = await readPartialHash(received.rootPath, received.relPath);
  let fullHash: string | undefined;
  for (const candidate of candidates) {
    if ((await readCandidatePartialHash(candidate)) === partialHash) {
      fullHash ??= await readFullHash(received.rootPath, received.relPath);
      if ((await readCandidateFullHash(candidate)) === fullHash) {
        return candidate.id;
      }
    }
  }
  return undefined;
}
