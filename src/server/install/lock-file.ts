// The lock file in the data folder, which stops two copies of the app sharing one database.
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

import { Type } from '@sinclair/typebox';

import { systemErrorCode } from '#core/errors.js';

import { updateDataSettings } from './data-folder.js';
import { readJsonFile, writeJsonFile } from './json-file.js';

const LOCK_FILE_NAME = 'morgue-file.lock';

const LockOwnerSchema = Type.Object({
  pid: Type.Integer({ minimum: 1 }),
  port: Type.Integer({ minimum: 1, maximum: 65535 }),
});

/** The running copy that holds the lock: its process id and the port it serves on. */
export type LockOwner = {
  readonly pid: number;
  readonly port: number;
};

/** Returns who holds the lock, or undefined if nobody does or the file is unreadable. */
export async function readLockOwner(dataDir: string): Promise<LockOwner | undefined> {
  try {
    return await readJsonFile(path.join(dataDir, LOCK_FILE_NAME), LockOwnerSchema);
  } catch {
    // A damaged lock file can't name a running copy, so it is treated as no lock.
    return undefined;
  }
}

/** Records this process as the one using the data folder. */
export async function writeLock(dataDir: string, owner: LockOwner): Promise<void> {
  await writeJsonFile(path.join(dataDir, LOCK_FILE_NAME), owner);
}

/**
 * Removes the lock if this process still holds it. Synchronous because it runs while the
 * process exits, when async work no longer completes.
 */
export function releaseLockSync(dataDir: string, pid: number): void {
  const lockPath = path.join(dataDir, LOCK_FILE_NAME);
  try {
    const owner = JSON.parse(readFileSync(lockPath, 'utf8')) as Partial<LockOwner>;
    if (owner.pid === pid) {
      rmSync(lockPath);
    }
  } catch {
    // No lock, or one we can't read: there is nothing of ours to remove.
  }
}

/** Says whether a process with this id is running, so a lock left by a crash can be ignored. */
export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return systemErrorCode(error) === 'EPERM';
  }
}

/** Marks the data folder as in use by this server and saves its port for the next launch. */
export async function claimDataFolder(dataDir: string, port: number): Promise<void> {
  await writeLock(dataDir, { pid: process.pid, port });
  await updateDataSettings(dataDir, { port });
}
