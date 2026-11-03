import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { claimNextJob, enqueueJob, findJob, MAX_JOB_ATTEMPTS } from '#core/db/repositories/jobs.js';
import { startJobQueue } from '#core/jobs/queue.js';

import { addTestItem, makeTempLibrary } from '../support/temp-library.ts';

import type { Job } from '#core/db/repositories/jobs.js';
import type { TempLibrary } from '../support/temp-library.ts';

const NOW = '2026-10-31T12:00:00.000Z';
let library: TempLibrary;

beforeEach(async () => {
  library = await makeTempLibrary();
});

afterEach(async () => {
  await library.remove();
});

describe('the jobs table', () => {
  it('hands out the most urgent job first, then the newest', () => {
    const [older, newer, urgent] = ['a.jpg', 'b.jpg', 'c.jpg'].map((relPath) =>
      addTestItem(library.db, relPath),
    );
    enqueueJob(library.db, { type: 'thumb-image', itemId: older!, priority: 2, now: NOW });
    enqueueJob(library.db, { type: 'thumb-image', itemId: newer!, priority: 2, now: NOW });
    enqueueJob(library.db, { type: 'thumb-image', itemId: urgent!, priority: 2, now: NOW });
    enqueueJob(library.db, { type: 'thumb-image', itemId: urgent!, priority: 0, now: NOW });
    const order = [1, 2, 3].map(() => claimNextJob(library.db, ['thumb-image'], NOW)?.itemId);
    expect(order).toEqual([urgent, newer, older]);
    expect(claimNextJob(library.db, ['thumb-image'], NOW)).toBeUndefined();
  });

  it('only hands out the types a lane asks for', () => {
    const itemId = addTestItem(library.db, 'clip.mp4', 'video');
    enqueueJob(library.db, { type: 'thumb-video', itemId, priority: 2, now: NOW });
    expect(claimNextJob(library.db, ['thumb-image', 'thumb-pdf'], NOW)).toBeUndefined();
    expect(claimNextJob(library.db, ['thumb-video'], NOW)?.itemId).toBe(itemId);
  });
});

describe('the job queue', () => {
  it('retries a failing job three times, then gives up on it', async () => {
    const itemId = addTestItem(library.db, 'broken.jpg');
    enqueueJob(library.db, { type: 'thumb-image', itemId, priority: 2, now: NOW });
    const givenUp: Job[] = [];
    let attempts = 0;
    const queue = startJobQueue({
      db: library.db,
      lanes: [{ types: ['thumb-image'], limit: 1 }],
      runJob: async () => {
        attempts += 1;
        await Promise.resolve();
        throw new Error('Unreadable image');
      },
      onGiveUp: (job) => givenUp.push(job),
      onQueueError: () => undefined,
    });
    await queue.whenIdle();
    expect(attempts).toBe(MAX_JOB_ATTEMPTS);
    expect(givenUp.map((job) => job.itemId)).toEqual([itemId]);
    expect(findJob(library.db, itemId, 'thumb-image')).toMatchObject({
      state: 'failed',
      lastError: 'Unreadable image',
    });
  });

  it('resumes jobs a stopped server left running', async () => {
    const itemId = addTestItem(library.db, 'a.jpg');
    enqueueJob(library.db, { type: 'thumb-image', itemId, priority: 2, now: NOW });
    claimNextJob(library.db, ['thumb-image'], NOW);
    const ran: number[] = [];
    const queue = startJobQueue({
      db: library.db,
      lanes: [{ types: ['thumb-image'], limit: 1 }],
      runJob: async (job) => {
        ran.push(job.itemId);
        await Promise.resolve();
      },
      onGiveUp: () => undefined,
      onQueueError: () => undefined,
    });
    await queue.whenIdle();
    expect(ran).toEqual([itemId]);
    expect(findJob(library.db, itemId, 'thumb-image')?.state).toBe('done');
  });

  it('runs no more jobs at once than a lane allows', async () => {
    for (const relPath of ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg']) {
      const itemId = addTestItem(library.db, relPath);
      enqueueJob(library.db, { type: 'thumb-image', itemId, priority: 2, now: NOW });
    }
    let running = 0;
    let mostAtOnce = 0;
    const queue = startJobQueue({
      db: library.db,
      lanes: [{ types: ['thumb-image'], limit: 2 }],
      runJob: async () => {
        running += 1;
        mostAtOnce = Math.max(mostAtOnce, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running -= 1;
      },
      onGiveUp: () => undefined,
      onQueueError: () => undefined,
    });
    await queue.whenIdle();
    expect(mostAtOnce).toBe(2);
  });
});
