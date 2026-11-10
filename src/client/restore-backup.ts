// Settings' restore form (R26): sends the chosen backup zip as the request's whole body with the
// launch token, then opens Home on the restored library. While it runs the form says so; a
// refusal shows beside it in the server's words. Nothing opens a dialog (R37).

/** Reads the per-launch token the server put in the page's meta tag; writes need it. */
function readToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="morgue-token"]')?.content ?? '';
}

/** Shows a line of text beside the form. */
function showResult(form: HTMLFormElement, message: string): void {
  const result = form.querySelector<HTMLElement>('[data-api-result]');
  if (result !== null) {
    result.textContent = message;
    result.hidden = false;
  }
}

/** The message a refusal carries, if its body is the server's JSON. */
async function readMessage(response: Response): Promise<string | undefined> {
  try {
    const answer = (await response.json()) as { message?: unknown };
    return typeof answer.message === 'string' ? answer.message : undefined;
  } catch {
    // Not JSON (a proxy's page, a body cut short): the caller says it in its own words.
    return undefined;
  }
}

/** Sends the zip and returns undefined once restored, or the reason it wasn't. */
async function sendBackup(file: File): Promise<string | undefined> {
  let response: Response;
  try {
    response = await fetch('/api/backup/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/zip', 'x-morgue-token': readToken() },
      body: file,
    });
  } catch {
    return "Morgue File isn't answering. Start it again with its shortcut, then reload this page.";
  }
  if (response.ok) {
    return undefined;
  }
  return (await readMessage(response)) ?? 'That backup could not be restored.';
}

/** Restores the chosen backup, then shows Home as the backup left it. */
async function restore(form: HTMLFormElement): Promise<void> {
  const file = form.querySelector<HTMLInputElement>('input[type="file"]')?.files?.[0];
  if (file === undefined) {
    return;
  }
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (button !== null) {
    button.disabled = true;
  }
  showResult(form, `Restoring ${file.name}…`);
  const refusal = await sendBackup(file);
  if (refusal === undefined) {
    window.location.assign('/');
    return;
  }
  showResult(form, refusal);
  if (button !== null) {
    button.disabled = false;
  }
}

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (form instanceof HTMLFormElement && form.dataset.restoreForm !== undefined) {
    event.preventDefault();
    void restore(form);
  }
});
