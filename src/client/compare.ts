// The compare board's window (R22), the one window the app opens (R37 allows it alone). On an
// Item page, "add to compare board" puts the item on the board and opens the board's window, or
// reloads it if it is open already. The board itself remembers where its window sits: it moves
// there when it first opens, and saves its place whenever it is resized or closed.

import { sendToApi } from './api-request.js';

/** The window's name, so every Item page opens the same one. */
const BOARD_WINDOW_NAME = 'morgue-compare';

/** The size the window first opens at; the board then moves to where it last sat. */
const OPENING_FEATURES = 'popup,width=1600,height=1000';

/** The smallest window the server keeps a place for. */
const SMALLEST_SIDE = 200;

/** How long resizing must pause before the new size is saved. */
const RESIZE_SAVE_DELAY_MS = 500;

/** The sessionStorage key saying this window has already been moved to its saved place. */
const PLACED_KEY = 'morgue-compare-placed';

/** Where a window sits, in screen pixels: what the server stores and moveTo and resizeTo take. */
type WindowPlace = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

/** Puts an item on the board, then opens the board, saying beside the button if it was refused. */
async function addToBoard(button: HTMLButtonElement): Promise<void> {
  const result = button.parentElement?.querySelector<HTMLElement>('[data-compare-result]');
  const sent = await sendToApi('/api/compare/items', {
    method: 'POST',
    body: { itemId: Number(button.dataset.compareAdd) },
  });
  if (result !== null && result !== undefined) {
    result.textContent = sent.isSaved ? '' : sent.message;
    result.hidden = sent.isSaved;
  }
  // A full board opens too, so a reference can be taken off it to make room.
  window.open('/compare', BOARD_WINDOW_NAME, OPENING_FEATURES)?.focus();
}

document.addEventListener('click', (event) => {
  const button =
    event.target instanceof Element ? event.target.closest('[data-compare-add]') : null;
  if (button instanceof HTMLButtonElement) {
    void addToBoard(button);
  }
});

/** Where this window sits now. */
function readPlace(): WindowPlace {
  return {
    left: Math.round(window.screenX),
    top: Math.round(window.screenY),
    width: Math.max(SMALLEST_SIDE, Math.round(window.outerWidth)),
    height: Math.max(SMALLEST_SIDE, Math.round(window.outerHeight)),
  };
}

/** The place the server last saved for the board's window, from the board's own markup. */
function readSavedPlace(board: HTMLElement): WindowPlace | undefined {
  const sides = (board.dataset.compareWindow ?? '').split(',').map(Number);
  const [left, top, width, height] = sides;
  if (sides.length !== 4 || sides.some((side) => !Number.isFinite(side))) {
    return undefined;
  }
  return { left: left ?? 0, top: top ?? 0, width: width ?? 0, height: height ?? 0 };
}

/** Whether this window was already moved to its saved place, before a reload. */
function wasPlaced(): boolean {
  try {
    return sessionStorage.getItem(PLACED_KEY) !== null;
  } catch {
    // Storage turned off: moving the window again on each reload is the only cost.
    return false;
  }
}

/** Notes that this window has been moved to its saved place. */
function markPlaced(): void {
  try {
    sessionStorage.setItem(PLACED_KEY, 'yes');
  } catch {
    // Storage turned off: see wasPlaced().
  }
}

/**
 * Moves a window the board's button opened to where the board last sat, once: after that the
 * window stays where it is put, through the reloads its own forms cause.
 */
function moveToSavedPlace(board: HTMLElement): void {
  const saved = readSavedPlace(board);
  if (saved === undefined || wasPlaced()) {
    return;
  }
  markPlaced();
  window.moveTo(saved.left, saved.top);
  window.resizeTo(saved.width, saved.height);
}

/** The place last saved, so a window that hasn't moved or changed size sends nothing. */
let lastSavedPlace = JSON.stringify(readPlace());

/** Saves where the window sits, if that has changed; as the page is left, sent to outlive it. */
function savePlace(isLeaving: boolean): void {
  const place = readPlace();
  if (JSON.stringify(place) === lastSavedPlace) {
    return;
  }
  lastSavedPlace = JSON.stringify(place);
  void sendToApi('/api/compare/window', {
    method: 'POST',
    body: place,
    isSentOnLeaving: isLeaving,
  });
}

/** Saves the window's place once resizing pauses, and again as the window closes or reloads. */
function keepPlace(): void {
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      savePlace(false);
    }, RESIZE_SAVE_DELAY_MS);
  });
  // A window that was only moved fires no event until it is closed or reloaded.
  window.addEventListener('pagehide', () => {
    savePlace(true);
  });
}

const board = document.querySelector<HTMLElement>('[data-compare-board]');
// Only the window the button opened keeps a place: the board opened in a browser tab by its
// address would otherwise save the main window's size as the board's.
if (board !== null && window.opener !== null) {
  moveToSavedPlace(board);
  keepPlace();
}
