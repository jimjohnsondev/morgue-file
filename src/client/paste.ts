// Ctrl+V on any page saves the pictures or files on the clipboard to the Inbox (R2), as a drop
// does. Pasting into a text field is left to the field.
import { readTransfer, saveToInbox } from './ingest-upload.js';

/** Says whether a paste is meant for a field being typed in, not for the page. */
function isForField(event: ClipboardEvent): boolean {
  const target = event.target;
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
  );
}

document.addEventListener('paste', (event) => {
  const data = event.clipboardData;
  if (isForField(event) || data === null || data.files.length === 0) {
    return;
  }
  event.preventDefault();
  // Read now: the browser empties the clipboard data once this handler returns.
  void saveToInbox(readTransfer(data));
});
