// Which thumbnail job each kind of item needs. The scanner and ingest queue them; the queue runs
// them with the workers in ./workers.
import { enqueueJob } from '#core/db/repositories/jobs.js';

import type { Db } from '#core/db/connection.js';
import type { ItemKind } from '#core/db/repositories/items.js';
import type { JobPriority, JobType } from '#core/db/repositories/jobs.js';

/** The job that makes each kind's thumbnail. CBZ files and page folders share a page reader. */
export const THUMB_JOB_BY_KIND: Readonly<Record<ItemKind, JobType>> = {
  image: 'thumb-image',
  video: 'thumb-video',
  pdf: 'thumb-pdf',
  cbz: 'thumb-pages',
  pagefolder: 'thumb-pages',
};

/** What to make a thumbnail for, how urgently, and when it was asked for. */
export type ThumbnailRequest = {
  readonly itemId: number;
  readonly kind: ItemKind;
  readonly priority: JobPriority;
  readonly now: string;
};

/** Queues the job that makes an item's default thumbnail. */
export function queueThumbnail(db: Db, request: ThumbnailRequest): void {
  enqueueJob(db, {
    type: THUMB_JOB_BY_KIND[request.kind],
    itemId: request.itemId,
    priority: request.priority,
    now: request.now,
  });
}
