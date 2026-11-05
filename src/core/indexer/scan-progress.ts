// What a full scan shows on the E5 bar while it runs: how many files it has found, how many there
// are in all once a quick count is in, and whether it has been paused.
import { countFiles } from '#core/archive/originals.js';

/** Where indexing writes what it did: Fastify's logger in the app. */
export type IndexingLog = {
  readonly info: (details: object, message: string) => void;
  readonly warn: (details: object, message: string) => void;
  readonly error: (details: object, message: string) => void;
};

/** A running scan's counts, updated as it goes. */
export type ScanCounts = {
  found: number;
  expected: number | undefined;
};

/** Holds scans between files while paused (E5's Pause), and lets them go on Resume. */
export type PauseGate = {
  readonly isPaused: () => boolean;
  readonly pause: () => void;
  readonly resume: () => void;
  /** Resolves at once while not paused, or once resumed. */
  readonly wait: () => Promise<void>;
};

/** Creates a gate that starts open. */
export function createPauseGate(): PauseGate {
  let isPaused = false;
  let waiters: (() => void)[] = [];
  return {
    isPaused: () => isPaused,
    pause: () => {
      isPaused = true;
    },
    resume: () => {
      isPaused = false;
      const released = waiters;
      waiters = [];
      for (const resolve of released) {
        resolve();
      }
    },
    wait: async () => {
      if (isPaused) {
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
    },
  };
}

/**
 * Counts the root's files alongside the scan, so the bar can say how many there are in all. The
 * count stops when `signal` aborts, so a scan that ends first isn't followed by a second walk.
 */
export async function countExpectedFiles(
  counts: ScanCounts,
  count: { readonly rootPath: string; readonly signal: AbortSignal },
  log: IndexingLog,
): Promise<void> {
  try {
    counts.expected = await countFiles(count.rootPath, count.signal);
  } catch (error) {
    if (!count.signal.aborted) {
      log.warn({ err: error }, 'Could not count the Reference folder’s files');
    }
  }
}
