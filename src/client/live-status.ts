// Keeps the frame's live notices current while a page is open: the indexing bar and its footer
// lines (E5) and the offline band (E3). /events sends the HTML of both slots whenever it changes,
// and this swaps it in. Pause, Resume and Check again post to /api/indexing/<action>.

/** The slots /events fills, by the name in their data-status-slot attribute. */
type SlotHtml = { readonly bands?: string; readonly footer?: string };

/** Reads the per-launch token the server put in the page's meta tag; writes need it. */
function readToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="morgue-token"]')?.content ?? '';
}

/** Replaces a slot's content with the server's, when it differs from what was last put there. */
function fillSlot(name: keyof SlotHtml, html: string | undefined, lastFilled: Map<string, string>) {
  const slot = document.querySelector<HTMLElement>(`[data-status-slot="${name}"]`);
  if (slot === null || html === undefined || lastFilled.get(name) === html) {
    return;
  }
  lastFilled.set(name, html);
  // The HTML comes from this app's own server, rendered and escaped by Preact.
  slot.innerHTML = html;
}

/** Listens to /events. EventSource reconnects by itself if the server restarts. */
function followStatus(): void {
  if (document.querySelector('[data-status-slot]') === null) {
    return;
  }
  const lastFilled = new Map<string, string>();
  const events = new EventSource('/events');
  events.addEventListener('status', (event) => {
    const slots = JSON.parse((event as MessageEvent<string>).data) as SlotHtml;
    fillSlot('bands', slots.bands, lastFilled);
    fillSlot('footer', slots.footer, lastFilled);
  });
}

/**
 * Sends Pause, Resume or Check again, with the button disabled until the server answers so a
 * double click sends one request. /events then redraws the bar or band.
 */
async function sendAction(button: HTMLButtonElement): Promise<void> {
  const action = button.dataset.indexingAction ?? '';
  button.disabled = true;
  try {
    await fetch(`/api/indexing/${encodeURIComponent(action)}`, {
      method: 'POST',
      headers: { 'x-morgue-token': readToken() },
    });
  } catch {
    // The server isn't answering; the page shows it as it was, and the user can try again.
  } finally {
    button.disabled = false;
  }
}

document.addEventListener('click', (event) => {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
    'button[data-indexing-action]',
  );
  if (button !== null && button !== undefined) {
    void sendAction(button);
  }
});

followStatus();
