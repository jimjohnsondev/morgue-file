// Selection mode on an Index page (frame 13): clicking a card ticks it instead of opening it,
// Shift-click ticks a run, Ctrl+A ticks the page, and the panel's links choose the page, the
// whole list or nothing. The panel's title, the Add button and the "on all selected" tags keep up.
import { isKeyForControl } from './keys.js';
import {
  findSelectionPanel,
  findTickBoxes,
  isWholeListSelected,
  takeKeptSelection,
} from './selection-state.js';

/** How many items are selected: the whole list's count, or the ticked boxes. */
function countSelected(panel: HTMLElement, boxes: readonly HTMLInputElement[]): number {
  return isWholeListSelected(panel)
    ? Number(panel.dataset.selectionTotal)
    : boxes.filter((box) => box.checked).length;
}

/** A chip for each tag the ticked cards carry, with how many of them carry it. */
function showSelectedTags(panel: HTMLElement, boxes: readonly HTMLInputElement[]): void {
  const counts = new Map<string, number>();
  for (const box of boxes.filter((ticked) => ticked.checked)) {
    const card = box.closest<HTMLElement>('[data-select-card]');
    const tags = JSON.parse(card?.dataset.tags ?? '[]') as string[];
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const line = panel.querySelector<HTMLElement>('[data-selection-tags]');
  const holder = panel.querySelector<HTMLElement>('[data-selection-tag-chips]');
  if (line === null || holder === null) {
    return;
  }
  const chips = [...counts].map(([tag, count]) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = `${tag} · ${String(count)}`;
    return chip;
  });
  holder.replaceChildren(...chips);
  // A whole list's tags aren't on this page, so the line shows only for ticked cards.
  line.hidden = chips.length === 0 || isWholeListSelected(panel);
}

/** Draws the selection: framed cards, the title's count, the Add button's number, the tags. */
function showSelection(panel: HTMLElement): void {
  const boxes = findTickBoxes();
  for (const box of boxes) {
    box.closest('[data-select-card]')?.classList.toggle('thumb-card--selected', box.checked);
  }
  const count = countSelected(panel, boxes);
  const listLabel = panel.querySelector('[data-select="list"]')?.textContent ?? '';
  const title = panel.querySelector('[data-selection-count="title"]');
  if (title !== null) {
    title.textContent = isWholeListSelected(panel)
      ? `${listLabel.charAt(0).toUpperCase()}${listLabel.slice(1)} selected`
      : `${count.toLocaleString('en-US')} selected on this page`;
  }
  for (const number of panel.querySelectorAll('[data-selection-count="number"]')) {
    number.textContent = count.toLocaleString('en-US');
  }
  showSelectedTags(panel, boxes);
}

/** Ticks every box on the page, or none; choosing the page leaves "whole list" mode. */
function tickAll(panel: HTMLElement, isTicked: boolean, mode: 'items' | 'list'): void {
  panel.dataset.selectionMode = mode;
  for (const box of findTickBoxes()) {
    box.checked = isTicked;
  }
  showSelection(panel);
}

/** The box a click on a card was aimed at, and whether the click was on the box itself. */
function clickedBox(target: Element): { box: HTMLInputElement; isOnBox: boolean } | undefined {
  const card = target.closest('[data-select-card]');
  const box = card?.querySelector<HTMLInputElement>('input[data-select-item]');
  if (box === undefined || box === null) {
    return undefined;
  }
  return { box, isOnBox: target === box };
}

/** Where the last run began: the box clicked last without Shift. */
let runStart: HTMLInputElement | undefined;

/** Ticks or clears every box from the run's start to this one, as the clicked box now is. */
function tickRun(box: HTMLInputElement): void {
  const boxes = findTickBoxes();
  const from = runStart === undefined ? -1 : boxes.indexOf(runStart);
  const to = boxes.indexOf(box);
  if (from === -1) {
    return;
  }
  for (const inRun of boxes.slice(Math.min(from, to), Math.max(from, to) + 1)) {
    inRun.checked = box.checked;
  }
}

/** A click on a card ticks it, or a run with Shift, instead of opening the item. */
function onCardClick(panel: HTMLElement, event: MouseEvent, target: Element): void {
  // A click on the box's label reaches the box as a click of its own.
  if (target.closest('.thumb-card__tick') !== null && !(target instanceof HTMLInputElement)) {
    return;
  }
  const clicked = clickedBox(target);
  if (clicked === undefined) {
    return;
  }
  if (!clicked.isOnBox) {
    event.preventDefault();
    clicked.box.checked = !clicked.box.checked;
  }
  if (event.shiftKey) {
    tickRun(clicked.box);
  } else {
    runStart = clicked.box;
  }
  panel.dataset.selectionMode = 'items';
  showSelection(panel);
}

/** The panel's "all on this page", "all 1,236 in Figure" and "none". */
function onSelectLink(panel: HTMLElement, choice: string | undefined): void {
  if (choice === 'page') {
    tickAll(panel, true, 'items');
  } else if (choice === 'list') {
    tickAll(panel, true, 'list');
  } else if (choice === 'none') {
    tickAll(panel, false, 'items');
  }
}

/** Ticks again what was selected before the last action's reload, as far as it's still here. */
function restoreKept(panel: HTMLElement): void {
  const kept = takeKeptSelection();
  if (kept === undefined) {
    return;
  }
  if ('query' in kept.selection) {
    tickAll(panel, true, 'list');
  } else {
    const keptIds = new Set(kept.selection.itemIds.map(String));
    for (const box of findTickBoxes()) {
      box.checked = keptIds.has(box.value);
    }
  }
  const result = panel.querySelector<HTMLElement>('[data-selection-result]');
  if (result !== null) {
    result.textContent = kept.message;
    result.hidden = false;
  }
}

/** Starts selection mode, if this page is in it. */
function startSelection(panel: HTMLElement): void {
  panel.dataset.selectionMode = 'items';
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }
    const link = event.target.closest<HTMLElement>('[data-select]');
    if (link !== null && panel.contains(link)) {
      onSelectLink(panel, link.dataset.select);
      return;
    }
    onCardClick(panel, event, event.target);
  });
  document.addEventListener('keydown', (event) => {
    if (
      event.key.toLowerCase() === 'a' &&
      (event.ctrlKey || event.metaKey) &&
      !isKeyForControl(event)
    ) {
      event.preventDefault();
      tickAll(panel, true, 'items');
    }
  });
  restoreKept(panel);
  showSelection(panel);
}

const panel = findSelectionPanel();
if (panel !== undefined) {
  startSelection(panel);
}
