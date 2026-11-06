// In-place editing (R37): a [rename] or [move] button opens its form where the value was, and
// cancel or Esc closes it again. The item page opens its [move] form at #filing, which E6's
// "file it now" links to. The forms themselves are sent by api-forms.ts.

/** Opens an inline form in place of the value it edits, and marks its table row as editing. */
function openForm(form: HTMLFormElement): void {
  for (const view of document.querySelectorAll<HTMLElement>(`[data-edit-view="${form.id}"]`)) {
    view.hidden = true;
  }
  form.hidden = false;
  form.closest('tr')?.setAttribute('data-editing', '');
  form.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')?.focus();
}

/** Closes an inline form and shows the value again. */
function closeForm(form: HTMLFormElement): void {
  form.hidden = true;
  form.closest('tr')?.removeAttribute('data-editing');
  for (const view of document.querySelectorAll<HTMLElement>(`[data-edit-view="${form.id}"]`)) {
    view.hidden = false;
  }
}

/** Finds the inline form with an id, if the page has one. */
function findEditForm(id: string): HTMLFormElement | undefined {
  const form = document.getElementById(id);
  return form instanceof HTMLFormElement && form.hasAttribute('data-edit-form') ? form : undefined;
}

/** Opens the form an [edit] button names, or closes the form whose cancel was clicked. */
function onClick(target: Element): void {
  const opener = target.closest<HTMLElement>('[data-edit-open]');
  if (opener !== null) {
    const form = findEditForm(opener.dataset.editOpen ?? '');
    if (form !== undefined) {
      openForm(form);
    }
    return;
  }
  const cancelled = target.closest('[data-edit-cancel]')?.closest('form');
  if (cancelled !== null && cancelled !== undefined) {
    closeForm(cancelled);
  }
}

document.addEventListener('click', (event) => {
  if (event.target instanceof Element) {
    onClick(event.target);
  }
});

document.addEventListener('keydown', (event) => {
  const form = event.target instanceof Element ? event.target.closest('form') : null;
  if (event.key === 'Escape' && form?.hasAttribute('data-edit-form') === true) {
    closeForm(form);
  }
});

const linkedForm = findEditForm(window.location.hash.slice(1));
if (linkedForm !== undefined) {
  openForm(linkedForm);
}
