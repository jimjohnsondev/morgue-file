// The item page's notes box (frames 5, 7, 8; R11) saves itself when it loses the focus with its
// text changed, as the mocks draw it with no Save button, and when the page is left while it
// still holds unsaved text (Alt+Left or closing the tab, which never blur it). api-forms.ts sends
// its form in place, as a request that outlives the page.

/** The boxes whose text changed since they were last sent. */
const unsaved = new Set<HTMLTextAreaElement>();

/** Whether an element is a box that saves itself. */
function isSavingBox(target: EventTarget | null): target is HTMLTextAreaElement {
  return target instanceof HTMLTextAreaElement && target.hasAttribute('data-save-on-change');
}

/** Sends a box's form and marks it saved. */
function sendBox(box: HTMLTextAreaElement): void {
  unsaved.delete(box);
  box.form?.requestSubmit();
}

document.addEventListener('input', (event) => {
  if (isSavingBox(event.target)) {
    unsaved.add(event.target);
  }
});

document.addEventListener('change', (event) => {
  if (isSavingBox(event.target)) {
    sendBox(event.target);
  }
});

window.addEventListener('pagehide', () => {
  for (const box of [...unsaved]) {
    sendBox(box);
  }
});
