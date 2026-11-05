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

/** The lock the tab holding /events keeps, and the channel it passes updates on. */
const EVENTS_LOCK = 'morgue-file-events';
const STATUS_CHANNEL = 'morgue-file-status';

/**
 * Keeps one /events stream for all of the archive's tabs, not one per tab: the browser allows
 * only six connections to the server, and every open tab would take one for good. The tab that
 * gets the lock opens the stream and passes each update to the others; when it closes, the lock
 * goes to another tab, which opens the stream in its place.
 */
function followStatus(): void {
  if (document.querySelector('[data-status-slot]') === null) {
    return;
  }
  const lastFilled = new Map<string, string>();
  function show(slots: SlotHtml): void {
    fillSlot('bands', slots.bands, lastFilled);
    fillSlot('footer', slots.footer, lastFilled);
  }
  const channel = new BroadcastChannel(STATUS_CHANNEL);
  channel.addEventListener('message', (event: MessageEvent<SlotHtml>) => {
    show(event.data);
  });
  void navigator.locks.request(EVENTS_LOCK, async () => {
    const events = new EventSource('/events');
    events.addEventListener('status', (event) => {
      const slots = JSON.parse((event as MessageEvent<string>).data) as SlotHtml;
      show(slots);
      channel.postMessage(slots);
    });
    // Held for as long as this tab is open; EventSource reconnects by itself meanwhile.
    await new Promise<never>(() => undefined);
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
    const response = await fetch(`/api/indexing/${encodeURIComponent(action)}`, {
      method: 'POST',
      headers: { 'x-morgue-token': readToken() },
    });
    if (response.status === 403) {
      // The server restarted since this page was drawn, so its token is stale; a reload fixes
      // it, and the user can click again.
      window.location.reload();
    }
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
