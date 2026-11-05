// The job queue's table: thumbnail work waiting, running, done or given up on. Kept in the
// database so a restart picks up where the last run stopped.
import { optional } from './sql-values.js';

import type { Db } from '../connection.js';

/**
 * The work a job does: a thumbnail, with its worker in core/jobs/workers, or the partial hash
 * alone, for items indexed before thumbnail jobs stored it (core/jobs/hash-jobs.ts).
 */
export type JobType = 'thumb-image' | 'thumb-video' | 'thumb-pdf' | 'thumb-pages' | 'hash';

/** 0 for the page being viewed, 1 for ingested files, 2 for background work. */
export type JobPriority = 0 | 1 | 2;

/** Where a job is in its life. */
export type JobState = 'queued' | 'running' | 'done' | 'failed';

/** A job as stored. */
export type Job = {
  readonly id: number;
  readonly type: JobType;
  readonly itemId: number;
  readonly priority: JobPriority;
  readonly state: JobState;
  readonly attempts: number;
  readonly lastError: string | undefined;
};

/** One try and three retries, then the job is marked failed (docs/ARCHITECTURE.md). */
export const MAX_JOB_ATTEMPTS = 4;

type JobRow = {
  id: number;
  type: JobType;
  item_id: number;
  priority: JobPriority;
  state: JobState;
  attempts: number;
  last_error: string | null;
  updated_at: string;
};

/** What to queue, and when. */
export type NewJob = {
  readonly type: JobType;
  readonly itemId: number;
  readonly priority: JobPriority;
  readonly now: string;
};

/**
 * Queues a job for an item. An item keeps one row per job type: a queued or running job keeps
 * the more urgent of the two priorities, and a finished one is queued again from scratch.
 */
export function enqueueJob(db: Db, job: NewJob): void {
  const existing = db
    .prepare('SELECT id, state, priority FROM jobs WHERE item_id = ? AND type = ?')
    .get(job.itemId, job.type) as Pick<JobRow, 'id' | 'state' | 'priority'> | undefined;
  if (existing === undefined) {
    db.prepare(
      `INSERT INTO jobs (type, item_id, priority, state, updated_at)
       VALUES (?, ?, ?, 'queued', ?)`,
    ).run(job.type, job.itemId, job.priority, job.now);
  } else if (existing.state === 'queued' || existing.state === 'running') {
    db.prepare('UPDATE jobs SET priority = min(priority, ?), updated_at = ? WHERE id = ?').run(
      job.priority,
      job.now,
      existing.id,
    );
  } else {
    db.prepare(
      `UPDATE jobs SET state = 'queued', priority = ?, attempts = 0, last_error = NULL,
         updated_at = ?
       WHERE id = ?`,
    ).run(job.priority, job.now, existing.id);
  }
}

/**
 * Takes the next queued job of the given types, most urgent first and then newest first, and
 * marks it running with one more attempt.
 */
export function claimNextJob(db: Db, types: readonly JobType[], now: string): Job | undefined {
  const placeholders = types.map(() => '?').join(', ');
  const claim = db.transaction(() => {
    const row = db
      .prepare(
        `SELECT * FROM jobs WHERE state = 'queued' AND type IN (${placeholders})
         ORDER BY priority, id DESC LIMIT 1`,
      )
      .get(...types) as JobRow | undefined;
    if (row === undefined) {
      return undefined;
    }
    db.prepare(
      `UPDATE jobs SET state = 'running', attempts = attempts + 1, updated_at = ? WHERE id = ?`,
    ).run(now, row.id);
    return toJob({ ...row, state: 'running', attempts: row.attempts + 1 });
  });
  return claim();
}

/** Marks a job done. */
export function completeJob(db: Db, id: number, now: string): void {
  db.prepare(`UPDATE jobs SET state = 'done', last_error = NULL, updated_at = ? WHERE id = ?`).run(
    now,
    id,
  );
}

/**
 * Records a failed attempt: the job is queued again until it has used all its attempts, then
 * marked failed. Returns the state it ends in.
 */
export function failJob(
  db: Db,
  failure: { readonly job: Job; readonly error: string; readonly now: string },
): JobState {
  const state = failure.job.attempts >= MAX_JOB_ATTEMPTS ? 'failed' : 'queued';
  db.prepare('UPDATE jobs SET state = ?, last_error = ?, updated_at = ? WHERE id = ?').run(
    state,
    failure.error,
    failure.now,
    failure.job.id,
  );
  return state;
}

/**
 * Queues a background hash job for every present item with no partial hash and no queued or
 * running job that will store one; an item that already had a hash job isn't queued again.
 * Returns how many it queued.
 */
export function queueHashJobsForUnhashedItems(db: Db, now: string): number {
  const result = db
    .prepare(
      `INSERT INTO jobs (type, item_id, priority, state, updated_at)
       SELECT 'hash', items.id, 2, 'queued', ? FROM items
       WHERE items.partial_hash IS NULL AND items.missing_since IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM jobs WHERE jobs.item_id = items.id
             AND (jobs.type = 'hash' OR jobs.state IN ('queued', 'running'))
         )`,
    )
    .run(now);
  return result.changes;
}

/** Puts jobs left running by a stopped server back in the queue, so a restart resumes them. */
export function requeueRunningJobs(db: Db): void {
  db.prepare(`UPDATE jobs SET state = 'queued' WHERE state = 'running'`).run();
}

/** Returns an item's job of one type, or undefined if it has none. */
export function findJob(db: Db, itemId: number, type: JobType): Job | undefined {
  const row = db.prepare('SELECT * FROM jobs WHERE item_id = ? AND type = ?').get(itemId, type) as
    JobRow | undefined;
  return row === undefined ? undefined : toJob(row);
}

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    type: row.type,
    itemId: row.item_id,
    priority: row.priority,
    state: row.state,
    attempts: row.attempts,
    lastError: optional(row.last_error),
  };
}
