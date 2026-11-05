// Tells a moved file from a new one (docs/ARCHITECTURE.md, Moves): a new path whose size and
// partial hash match an item that has just gone missing is that item, re-pointed, so it keeps
// its tags, collections, fields and models (R1).
import { createHash } from 'node:crypto';

import { listFolder, readPartialHash } from '#core/archive/originals.js';
import { findRecentlyMissing } from '#core/db/repositories/item-files.js';

import type { Db } from '#core/db/connection.js';
import type { ScanState } from '#core/db/repositories/item-files.js';
import type { ItemKind } from '#core/db/repositories/items.js';

/** How long a missing item can still be claimed by a file found elsewhere. */
const MOVE_WINDOW_MS = 10 * 60 * 1000;

/** A file or page folder found at a path no item has, which may be a moved item. */
export type NewEntry = {
  readonly relPath: string;
  readonly kind: ItemKind;
  readonly size: number;
};

/** The items a new entry might be: the scan's not yet seen ones, and recently missing ones. */
export type MovePool = {
  /** Says whether any item has the entry's kind and size, so the entry is worth holding back. */
  readonly mightMatch: (entry: NewEntry) => boolean;
  /**
   * Finds the item a new entry was moved from and claims it, so no other entry can. An item
   * the scan has seen at its own path is never a match (`isSeen`).
   */
  readonly claimMatch: (
    entry: NewEntry,
    isSeen: (state: ScanState) => boolean,
  ) => Promise<ScanState | undefined>;
};

/** What a pool needs: the library, the root and its folder, and the scan's clock. */
export type MovePoolOptions = {
  readonly db: Db;
  readonly rootId: number;
  readonly rootPath: string;
  readonly now: Date;
};

/** Groups items by kind and size, the two things a moved file can't change. */
function matchKey(entry: { readonly kind: ItemKind; readonly size: number }): string {
  return `${entry.kind}:${String(entry.size)}`;
}

/**
 * A page folder's stand-in for a partial hash: its pages' names and sizes. A folder of scans
 * moves as a whole, so the list is as telling as reading the pages, and much cheaper.
 */
async function readPageFolderHash(rootPath: string, relPath: string): Promise<string> {
  const pages = (await listFolder(rootPath, relPath)).filter((entry) => !entry.isFolder);
  pages.sort((left, right) => left.name.localeCompare(right.name));
  const hash = createHash('sha256');
  for (const page of pages) {
    hash.update(`${page.name}:${String(page.size)}\n`);
  }
  return hash.digest('hex');
}

/** Works out the hash that matches a moved file, or page folder, with its item. */
export async function readMoveHash(
  rootPath: string,
  entry: { readonly relPath: string; readonly kind: ItemKind },
): Promise<string> {
  return entry.kind === 'pagefolder'
    ? readPageFolderHash(rootPath, entry.relPath)
    : readPartialHash(rootPath, entry.relPath);
}

/** Says whether an item may still be claimed: there now but unseen, or missing for under 10 minutes. */
function isClaimable(state: ScanState, cutoff: string): boolean {
  return state.missingSince === undefined || state.missingSince >= cutoff;
}

/**
 * Collects the items a scan's new entries might have moved from: the stored items it compares
 * against, plus any item under the root that went missing in the last 10 minutes.
 */
export function createMovePool(options: MovePoolOptions, stored: readonly ScanState[]): MovePool {
  const cutoff = new Date(options.now.getTime() - MOVE_WINDOW_MS).toISOString();
  const recentlyMissing = findRecentlyMissing(options.db, options.rootId, cutoff);
  const byKey = new Map<string, ScanState[]>();
  const pooledIds = new Set<number>();
  for (const state of [...stored, ...recentlyMissing]) {
    if (pooledIds.has(state.id) || !isClaimable(state, cutoff)) {
      continue;
    }
    pooledIds.add(state.id);
    byKey.set(matchKey(state), [...(byKey.get(matchKey(state)) ?? []), state]);
  }
  const claimed = new Set<number>();
  return {
    mightMatch: (entry) => byKey.has(matchKey(entry)),
    claimMatch: async (entry, isSeen) => {
      const candidates = (byKey.get(matchKey(entry)) ?? []).filter(
        (state) => !claimed.has(state.id) && !isSeen(state) && state.partialHash !== undefined,
      );
      if (candidates.length === 0) {
        return undefined;
      }
      const hash = await readMoveHash(options.rootPath, entry);
      const match = candidates.find((state) => state.partialHash === hash);
      if (match !== undefined) {
        claimed.add(match.id);
      }
      return match;
    },
  };
}
