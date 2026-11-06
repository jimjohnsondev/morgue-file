// What is selected on an Index page in selection mode (frame 13), read from the page itself: the
// ticked boxes, or the whole list when "all 1,236 in Figure" was chosen. selection.ts changes
// it and bulk-actions.ts sends it; a selection is kept across the reload after an action.

/** The items an action is for, as the server takes them. */
export type Selection = { readonly itemIds: readonly number[] } | { readonly query: string };

/** What is kept across the reload after an action, for one page address. */
type KeptSelection = {
  readonly address: string;
  readonly selection: Selection;
  readonly message: string;
};

const STORAGE_KEY = 'morgue-file-selection';

/** The action panel, on a page in selection mode. */
export function findSelectionPanel(): HTMLElement | undefined {
  return document.querySelector<HTMLElement>('[data-selection-panel]') ?? undefined;
}

/** Every card's tick box, in page order. */
export function findTickBoxes(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>('input[data-select-item]')];
}

/** Whether the whole list is selected, rather than the boxes ticked on this page. */
export function isWholeListSelected(panel: HTMLElement): boolean {
  return panel.dataset.selectionMode === 'list';
}

/** What is selected now, or undefined when nothing is. */
export function readSelection(panel: HTMLElement): Selection | undefined {
  if (isWholeListSelected(panel)) {
    return { query: panel.dataset.selectionQuery ?? '' };
  }
  const itemIds = findTickBoxes()
    .filter((box) => box.checked)
    .map((box) => Number(box.value));
  return itemIds.length === 0 ? undefined : { itemIds };
}

/** This page's address, which a kept selection belongs to. */
function pageAddress(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/** Keeps the selection and what was done for the page that loads next. */
export function keepSelection(selection: Selection, message: string): void {
  const kept: KeptSelection = { address: pageAddress(), selection, message };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch {
    // Storage is off (a private window): the page reloads with nothing selected, which is safe.
  }
}

/** Takes the selection kept for this page, if the last action on it left one. */
export function takeKeptSelection(): Omit<KeptSelection, 'address'> | undefined {
  let kept: KeptSelection | undefined;
  try {
    const text = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    kept = text === null ? undefined : (JSON.parse(text) as KeptSelection);
  } catch {
    // Storage is off, or holds something else: start with nothing selected.
    return undefined;
  }
  return kept?.address === pageAddress() ? kept : undefined;
}
