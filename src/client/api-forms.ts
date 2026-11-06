// Sends Settings' and the item page's edit forms to the server as JSON with the launch token,
// which a plain form post can't carry. The page reloads once the change is saved, so it shows
// the archive as it now is; a refusal shows beside the form in the server's own words.

const NO_SERVER_MESSAGE =
  "Morgue File isn't answering. Start it again with its shortcut, then reload this page.";

/** Reads the per-launch token the server put in the page's meta tag. */
function readToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="morgue-token"]')?.content ?? '';
}

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
  const method = form.dataset.apiMethod ?? 'POST';
  const fields = readFields(form);
  const hasBody = method === 'POST' && Object.keys(fields).length > 0;
  try {
    const response = await fetch(form.dataset.apiForm ?? '', {
      method,
      headers: {
        'x-morgue-token': readToken(),
        ...(hasBody && { 'content-type': 'application/json' }),
      },
      ...(hasBody && { body: JSON.stringify(fields) }),
    });
    if (response.ok) {
      return undefined;
    }
    const answer = (await response.json()) as { message?: string };
    return answer.message ?? 'That change could not be saved. Check the values and try again.';
  } catch {
    // No answer at all: most likely the "Morgue File server" window was closed.
    return NO_SERVER_MESSAGE;
  }
}

/** Shows the server's refusal beside the form that was refused. */
function showRefusal(form: HTMLFormElement, message: string): void {
  const result = form.querySelector<HTMLElement>('[data-api-result]');
  if (result !== null) {
    result.textContent = message;
    result.hidden = false;
  }
}

/** Sends a form, then reloads the page without its #filing so no form opens again. */
async function submitForm(form: HTMLFormElement): Promise<void> {
  const refusal = await sendForm(form);
  if (refusal === undefined) {
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
