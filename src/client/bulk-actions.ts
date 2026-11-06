// Sends the action panel's forms (frame 13) with what is selected: the ticked items, or the
// whole list's query. Each is one request the server runs in one transaction, so 200 items are
// tagged in one action (R10). The page then reloads with the same items still selected and a
// line saying what was done; a refusal shows on that line in the server's own words.
import { sendToApi } from './api-request.js';
import { findSelectionPanel, keepSelection, readSelection } from './selection-state.js';

/** Writes "31 items", "1 item". */
function itemsLabel(count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'item' : 'items'}`;
}

/** The form's fields as text, trimmed; the server checks them. */
function readFields(form: HTMLFormElement): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [name, value] of new FormData(form)) {
    if (typeof value === 'string') {
      fields[name] = value.trim();
    }
  }
  return fields;
}

/** Shows a line in the panel: what was done, or why it wasn't. */
function showResult(panel: HTMLElement, message: string): void {
  const result = panel.querySelector<HTMLElement>('[data-selection-result]');
  if (result !== null) {
    result.textContent = message;
    result.hidden = false;
  }
}

/** How many items the server says it changed, or how many were sent if it didn't say. */
function changedCount(answer: unknown, fallback: number): number {
  const count = (answer as { itemCount?: unknown } | undefined)?.itemCount;
  return typeof count === 'number' ? count : fallback;
}

/** Sends one action for the selection, then reloads, or shows the refusal. */
async function sendAction(panel: HTMLElement, form: HTMLFormElement, button: HTMLElement) {
  const selection = readSelection(panel);
  if (selection === undefined) {
    showResult(panel, 'Select some items first: click their thumbnails.');
    return;
  }
  const sent = await sendToApi(button.dataset.bulkAction ?? '', {
    method: 'POST',
    body: { ...readFields(form), selection },
  });
  if (!sent.isSaved) {
    showResult(panel, sent.message);
    return;
  }
  const sentCount = 'itemIds' in selection ? selection.itemIds.length : 0;
  const done = (button.dataset.bulkDone ?? 'Done.').replace(
    '{items}',
    itemsLabel(changedCount(sent.answer, sentCount)),
  );
  keepSelection(selection, done);
  window.location.reload();
}

document.addEventListener('submit', (event) => {
  const form = event.target;
  const panel = findSelectionPanel();
  if (!(form instanceof HTMLFormElement) || form.dataset.bulkForm === undefined || !panel) {
    return;
  }
  event.preventDefault();
  // Enter in a field sends the form's first button, as the browser would.
  const button =
    event.submitter instanceof HTMLElement
      ? event.submitter
      : form.querySelector<HTMLElement>('[data-bulk-action]');
  if (button !== null) {
    void sendAction(panel, form, button);
  }
});
