// Runs queued jobs in the background, a few at a time, in lanes so slow video work can't hold up
// photos (docs/ARCHITECTURE.md, Job queue). The jobs table is the queue, so a restart resumes it.
import os from 'node:os';

import {
  claimNextJob,
  completeJob,
  failJob,
  requeueRunningJobs,
} from '#core/db/repositories/jobs.js';

import type { Db } from '#core/db/connection.js';
import type { Job, JobType } from '#core/db/repositories/jobs.js';

/** A set of job types that share a limit on how many run at once. */
export type QueueLane = {
  readonly types: readonly JobType[];
  readonly limit: number;
};

/**
 * Images, PDFs, pages and hash jobs share one lane sized to half the cores; videos get their
 * own, with at most two ffmpeg processes.
 */
export const DEFAULT_LANES: readonly QueueLane[] = [
  {
    types: ['thumb-image', 'thumb-pdf', 'thumb-pages', 'hash'],
    limit: Math.max(1, Math.floor(os.availableParallelism() / 2)),
  },
  { types: ['thumb-video'], limit: 2 },
];

/** What the queue runs, and what it calls when a job has used up its attempts. */
export type JobQueueOptions = {
  readonly db: Db;
  readonly lanes: readonly QueueLane[];
  readonly runJob: (job: Job) => Promise<void>;
  readonly onGiveUp: (job: Job, error: unknown) => void;
  /** Told when the queue itself can't record a job's outcome (a locked or closed database). */
  readonly onQueueError: (job: Job, error: unknown) => void;
};

/** A running queue. */
export type JobQueue = {
  /** Looks for new work; call after queuing jobs. */
  readonly wake: () => void;
  /** Resolves once nothing is queued or running. */
  readonly whenIdle: () => Promise<void>;
  /** Stops taking jobs and waits for the running ones to finish. */
  readonly stop: () => Promise<void>;
};

/** The text stored as a job's last error. */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One lane's running count. */
type LaneState = { readonly lane: QueueLane; running: number };

/** Everything a running queue keeps track of. */
type QueueState = {
  readonly options: JobQueueOptions;
  readonly lanes: readonly LaneState[];
  readonly running: Set<Promise<void>>;
  idleWaiters: (() => void)[];
  isStopped: boolean;
};

/** Records a failed attempt; a job that has used all its attempts is given up on. */
function recordFailure(queue: QueueState, job: Job, error: unknown): void {
  const now = new Date().toISOString();
  if (failJob(queue.options.db, { job, error: errorText(error), now }) === 'failed') {
    queue.options.onGiveUp(job, error);
  }
}

/**
 * Runs one job and records how it went. It never rejects: if even the record can't be written,
 * that is reported, so one bad write can't crash the server with an unhandled rejection.
 */
async function runOne(queue: QueueState, job: Job): Promise<void> {
  try {
    try {
      await queue.options.runJob(job);
    } catch (error) {
      recordFailure(queue, job, error);
      return;
    }
    completeJob(queue.options.db, job.id, new Date().toISOString());
  } catch (error) {
    queue.options.onQueueError(job, error);
  }
}

/** Starts a job and, when it ends, frees its place and looks for the next one. */
function startJob(queue: QueueState, lane: LaneState, job: Job): void {
  lane.running += 1;
  const task = runOne(queue, job);
  queue.running.add(task);
  void (async () => {
    await task;
    queue.running.delete(task);
    lane.running -= 1;
    wakeQueue(queue);
  })();
}

/** Starts jobs in every lane until each is full or has nothing queued. */
function wakeQueue(queue: QueueState): void {
  for (const lane of queue.lanes) {
    while (!queue.isStopped && lane.running < lane.lane.limit) {
      const job = claimNextJob(queue.options.db, lane.lane.types, new Date().toISOString());
      if (job === undefined) {
        break;
      }
      startJob(queue, lane, job);
    }
  }
  if (queue.running.size === 0) {
    const waiters = queue.idleWaiters;
    queue.idleWaiters = [];
    for (const resolve of waiters) {
      resolve();
    }
  }
}

/**
 * Starts the queue. Jobs a stopped server left running go back in the queue first. Every write
 * to the jobs table happens here, on the main thread's one write connection.
 */
export function startJobQueue(options: JobQueueOptions): JobQueue {
  requeueRunningJobs(options.db);
  const queue: QueueState = {
    options,
    lanes: options.lanes.map((lane) => ({ lane, running: 0 })),
    running: new Set(),
    idleWaiters: [],
    isStopped: false,
  };
  wakeQueue(queue);
  return {
    wake: () => {
      wakeQueue(queue);
    },
    whenIdle: async () => {
      if (queue.running.size > 0) {
        await new Promise<void>((resolve) => queue.idleWaiters.push(resolve));
      }
    },
    stop: async () => {
      queue.isStopped = true;
      await Promise.all(queue.running);
    },
  };
}
