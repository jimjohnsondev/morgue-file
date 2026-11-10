// The compare board (R22): up to four references side by side in a window of their own. Which
// items it holds, how they are laid out and where its window sat are kept in the library's
// settings, so the board comes back as it was after a restart.
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

import { findItemById } from '#core/db/repositories/items.js';
import { readSetting, writeSetting } from '#core/db/repositories/settings.js';
import { AppError } from '#core/errors.js';

import type { Db } from '#core/db/connection.js';
import type { Static } from '@sinclair/typebox';

/** How many references the board holds at once. */
export const COMPARE_BOARD_LIMIT = 4;

/** The settings key the board is stored under, as JSON. */
const BOARD_SETTING = 'compare-board';

/** The window's place and size in screen pixels, as the browser reports and takes them. */
export const CompareWindowSchema = Type.Object({
  left: Type.Integer({ minimum: -20_000, maximum: 20_000 }),
  top: Type.Integer({ minimum: -20_000, maximum: 20_000 }),
  width: Type.Integer({ minimum: 200, maximum: 20_000 }),
  height: Type.Integer({ minimum: 200, maximum: 20_000 }),
});

/** Where the board's window sat when it was last moved or resized. */
export type CompareWindow = Static<typeof CompareWindowSchema>;

/** The references in one row side by side, or in a grid two wide. */
export const CompareLayoutSchema = Type.Union([Type.Literal('row'), Type.Literal('grid')]);

/** How the board lays out its references. */
export type CompareLayout = Static<typeof CompareLayoutSchema>;

const StoredBoardSchema = Type.Object({
  itemIds: Type.Array(Type.Integer({ minimum: 1 }), { maxItems: COMPARE_BOARD_LIMIT }),
  layout: CompareLayoutSchema,
  window: Type.Optional(CompareWindowSchema),
});

/** What the board holds, in the order the references were added, and how it is shown. */
export type CompareBoard = {
  readonly itemIds: readonly number[];
  readonly layout: CompareLayout;
  readonly window: CompareWindow | undefined;
};

const EMPTY_BOARD: CompareBoard = { itemIds: [], layout: 'row', window: undefined };

/** Parses stored JSON text, or returns undefined if it isn't JSON. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Treated like a value of the wrong shape: the board starts empty again.
    return undefined;
  }
}

/**
 * Reads the board from settings. One never saved, or one that no longer has the expected shape
 * (a hand-edited library), reads as an empty board rather than breaking the page.
 */
export function readCompareBoard(db: Db): CompareBoard {
  const text = readSetting(db, BOARD_SETTING);
  const stored = text === undefined ? undefined : parseJson(text);
  if (!Value.Check(StoredBoardSchema, stored)) {
    return EMPTY_BOARD;
  }
  return { itemIds: stored.itemIds, layout: stored.layout, window: stored.window };
}

/** Saves the whole board. */
function saveCompareBoard(db: Db, board: CompareBoard): void {
  const stored = {
    itemIds: board.itemIds,
    layout: board.layout,
    ...(board.window && { window: board.window }),
  };
  writeSetting(db, BOARD_SETTING, JSON.stringify(stored));
}

/**
 * Puts an item on the board after the ones already there. An item already on it stays where it
 * is. A full board refuses, so a reference never drops off unseen.
 */
export function addToCompareBoard(db: Db, itemId: number): void {
  if (findItemById(db, itemId) === undefined) {
    throw new AppError('not-found', `No item ${String(itemId)}.`);
  }
  const board = readCompareBoard(db);
  if (board.itemIds.includes(itemId)) {
    return;
  }
  if (board.itemIds.length >= COMPARE_BOARD_LIMIT) {
    throw new AppError(
      'compare-board-full',
      `The compare board holds ${String(COMPARE_BOARD_LIMIT)} references. Remove one from it first.`,
    );
  }
  saveCompareBoard(db, { ...board, itemIds: [...board.itemIds, itemId] });
}

/** Takes an item off the board; the others keep their order. */
export function removeFromCompareBoard(db: Db, itemId: number): void {
  const board = readCompareBoard(db);
  saveCompareBoard(db, { ...board, itemIds: board.itemIds.filter((id) => id !== itemId) });
}

/** Changes how the board lays out its references. */
export function setCompareLayout(db: Db, layout: CompareLayout): void {
  saveCompareBoard(db, { ...readCompareBoard(db), layout });
}

/** Remembers where the board's window sits, so it opens there next time. */
export function saveCompareWindow(db: Db, window: CompareWindow): void {
  saveCompareBoard(db, { ...readCompareBoard(db), window });
}
