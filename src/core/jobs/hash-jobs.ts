// Hash jobs store the partial hash of items indexed before thumbnail jobs stored it (release
// 1.6.1 and earlier), so a file moved after an upgrade is still recognized (R1; docs/
// ARCHITECTURE.md, Moves). The runtime queues them once at startup, behind any other work.
import { setItemPartialHash } from '#core/db/repositories/item-files.js';
import { findItemById } from '#core/db/repositories/items.js';
import { queueHashJobsForUnhashedItems } from '#core/db/repositories/jobs.js';
import { findRootById } from '#core/db/repositories/roots.js';
import { AppError } from '#core/errors.js';
import { readMoveHash } from '#core/indexer/moves.js';

import type { Db } from '#core/db/connection.js';
import type { Job } from '#core/db/repositories/jobs.js';

/** Queues a hash job for each item that has no partial hash and no job coming that stores one. */
export function queueMissingHashes(db: Db, now: Date): number {
  return queueHashJobsForUnhashedItems(db, now.toISOString());
}

/** Works out and stores one item's partial hash. */
export async function runHashJob(db: Db, job: Job): Promise<void> {
  const item = findItemById(db, job.itemId);
  const root = item === undefined ? undefined : findRootById(db, item.rootId);
  if (item === undefined || root === undefined) {
    throw new AppError('not-found', `Item ${String(job.itemId)} or its root no longer exists.`);
  }
  setItemPartialHash(db, item.id, await readMoveHash(root.path, item));
}
