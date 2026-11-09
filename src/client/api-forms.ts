// Sends Settings', the item page's and the profile editor's forms to the server as JSON with the
// launch token, which a plain form post can't carry. The page reloads once the change is saved
// (or opens the page the form names next), so it shows the archive as it now is; a refusal
// shows beside the form in the server's own words.

import { sendToApi } from './api-request.js';

/** The form's fields as JSON text values; empty ones are left out, as optional. */
function readFields(form: HTMLFormElement): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [name, value] of new FormData(form)) {
    if (typeof value === 'string' && value.trim() !== '') {
      fields[name] = value;
    }
  }
  return fields;
}

/** Sends a form and returns undefined once saved, or the message to show if it wasn't. */
async function sendForm(form: HTMLFormElement): Promise<string | undefined> {
  const method = form.dataset.apiMethod === 'DELETE' ? 'DELETE' : 'POST';
  const fields = readFields(form);
  const hasBody = method === 'POST' && Object.keys(fields).length > 0;
  const sent = await sendToApi(form.dataset.apiForm ?? '', {
    method,
    ...(hasBody && { body: fields }),
  });
  return sent.isSaved ? undefined : sent.message;
}

/** Shows the server's refusal beside the form that was refused. */
function showRefusal(form: HTMLFormElement, message: string): void {
  const result = form.querySelector<HTMLElement>('[data-api-result]');
  if (result !== null) {
    result.textContent = message;
    result.hidden = false;
  }
}

/**
 * Sends a form, then opens the page it names next (an edit page's profile), or reloads this one
 * without its #filing so no form opens again.
 */
async function submitForm(form: HTMLFormElement): Promise<void> {
  const refusal = await sendForm(form);
  if (refusal === undefined && form.dataset.apiNext !== undefined) {
    window.location.assign(form.dataset.apiNext);
  } else if (refusal === undefined) {
    window.location.replace(`${window.location.pathname}${window.location.search}`);
  } else {
    showRefusal(form, refusal);
  }
}

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (form instanceof HTMLFormElement && form.dataset.apiForm !== undefined) {
    event.preventDefault();
    void submitForm(form);
  }
});
