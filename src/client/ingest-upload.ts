// Saves what is dropped or pasted onto a page to the Inbox (R2): each file is posted to
// /api/ingest, or a web address dragged with no file to /api/ingest/url. The page then reloads
// with `saved=<item id>`, which shows the "Saved to Unsorted" notice (E6). A refusal is shown in
// the drop outline until the next click or key.

/** What a drop or paste carries, read while its event runs: the browser clears it afterwards. */
export type Transfer = {
  readonly files: readonly File[];
  /** The address a browser image came from, when the browser says. */
  readonly sourceUrl: string | undefined;
};

/** The upload's reply: the item the file became, or why it was refused. */
type IngestReply = { readonly itemId?: number; readonly message?: string };

/** Reads the per-launch token the server put in the page's meta tag; writes need it. */
function readToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="morgue-token"]')?.content ?? '';
}

/** The first address in a `text/uri-list`, which may hold comments and several lines. */
function firstListedAddress(uriList: string): string | undefined {
  const lines = uriList.split(/\r?\n/).map((line) => line.trim());
  return lines.find((line) => line !== '' && !line.startsWith('#'));
}

/** The `src` of the first image in dragged HTML, as browsers send for an image from a page. */
function imageSourceIn(html: string): string | undefined {
  if (html === '') {
    return undefined;
  }
  // DOMParser builds an inert document: its images don't load and its scripts don't run.
  const image = new DOMParser().parseFromString(html, 'text/html').querySelector('img[src]');
  return image?.getAttribute('src') ?? undefined;
}

/**
 * Reads a drop's or paste's files and source address. The address comes from `text/uri-list`,
 * else from the `img src` in `text/html`; the server keeps it only if it is a web address.
 */
export function readTransfer(data: DataTransfer): Transfer {
  const sourceUrl =
    firstListedAddress(data.getData('text/uri-list')) ?? imageSourceIn(data.getData('text/html'));
  return { files: Array.from(data.files), sourceUrl };
}

/** A request body and the type it is sent as. */
type Upload = { readonly body: BodyInit; readonly contentType: string };

/** Posts a request with the token and returns the new item's id, or throws the server's reason. */
async function post(address: string, upload: Upload): Promise<number> {
  const response = await fetch(address, {
    method: 'POST',
    headers: { 'content-type': upload.contentType, 'x-morgue-token': readToken() },
    body: upload.body,
  });
  if (response.status === 403) {
    // The server restarted since this page was drawn, so its token is stale; a reload fixes it,
    // and the user can drop again.
    window.location.reload();
    throw new Error('This page is out of date, so it is being reloaded. Drop the file again.');
  }
  const reply = (await response.json()) as IngestReply;
  if (!response.ok || reply.itemId === undefined) {
    throw new Error(reply.message ?? 'Morgue File could not save it.');
  }
  return reply.itemId;
}

/** Saves one file, with the address it came from. */
async function postFile(file: File, sourceUrl: string | undefined): Promise<number> {
  const query = new URLSearchParams({ name: file.name });
  if (sourceUrl !== undefined) {
    query.set('source', sourceUrl);
  }
  return post(`/api/ingest?${query.toString()}`, {
    body: file,
    contentType: 'application/octet-stream',
  });
}

/** Saves every file, or fetches the address if there are none; returns the last item's id. */
async function saveTransfer(transfer: Transfer): Promise<number | undefined> {
  let savedId: number | undefined;
  for (const file of transfer.files) {
    savedId = await postFile(file, transfer.sourceUrl);
  }
  if (transfer.files.length === 0 && transfer.sourceUrl !== undefined) {
    savedId = await post('/api/ingest/url', {
      body: JSON.stringify({ url: transfer.sourceUrl }),
      contentType: 'application/json',
    });
  }
  return savedId;
}

/** The events that put the drop outline back as it was after a refusal. */
const REFUSAL_ENDINGS = ['pointerdown', 'keydown', 'dragenter'];

/** The drop outline and the two lines of text in it. */
type OutlineParts = {
  readonly outline: HTMLElement;
  readonly title: HTMLElement;
  readonly line: HTMLElement;
};

/** Finds the drop outline the frame draws on every page, if this page has one. */
function findOutline(): OutlineParts | undefined {
  const outline = document.querySelector<HTMLElement>('[data-drop-outline]');
  const title = outline?.querySelector<HTMLElement>('.drop-outline__title');
  const line = outline?.querySelector<HTMLElement>('.drop-outline__line');
  if (
    outline === null ||
    title === null ||
    title === undefined ||
    line === null ||
    line === undefined
  ) {
    return undefined;
  }
  return { outline, title, line };
}

/** Shows why a drop wasn't saved in the drop outline, until the next click, key or drag. */
function showRefusal(message: string): void {
  const parts = findOutline();
  if (parts === undefined) {
    return;
  }
  const { outline, title, line } = parts;
  const [titleText, lineText] = [title.textContent, line.textContent];
  title.textContent = 'Not saved';
  line.textContent = message;
  outline.removeAttribute('hidden');
  function restore(): void {
    outline.setAttribute('hidden', '');
    title.textContent = titleText;
    line.textContent = lineText;
    for (const type of REFUSAL_ENDINGS) {
      document.removeEventListener(type, restore, { capture: true });
    }
  }
  // Captured, so a new drag finds the outline as it was before drop-outline.ts shows it again.
  for (const type of REFUSAL_ENDINGS) {
    document.addEventListener(type, restore, { capture: true });
  }
}

/**
 * Saves a drop or paste and reloads the page with its "Saved to Unsorted" notice, or shows why
 * it was refused. Several files are saved one after another; the notice names the last.
 */
export async function saveToInbox(transfer: Transfer): Promise<void> {
  try {
    const savedId = await saveTransfer(transfer);
    if (savedId !== undefined) {
      const address = new URL(window.location.href);
      address.searchParams.set('saved', String(savedId));
      window.location.assign(address);
    }
  } catch (error) {
    showRefusal(error instanceof Error ? error.message : String(error));
  }
}
