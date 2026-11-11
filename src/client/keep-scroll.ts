// Keeps the scroll position when moving along a list: an Index page's page links, Prev and Next
// between items, and the reader's page links. Each is marked data-keep-scroll; following one saves
// how far down the page was, and the page it opens scrolls back to the same spot.

/** The sessionStorage entry holding the address being opened and the scroll position to restore. */
const STORAGE_KEY = 'morgue-keep-scroll';

/** Where a saved scroll position applies, and how far down to scroll there. */
type SavedScroll = { readonly address: string; readonly top: number };

/** An address without its #fragment, so the same page matches however it was reached. */
function withoutFragment(address: string): string {
  const url = new URL(address, window.location.href);
  url.hash = '';
  return url.href;
}

/** Saves the scroll position for the page at this address. */
function saveScrollFor(address: string): void {
  const saved: SavedScroll = { address: withoutFragment(address), top: window.scrollY };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Storage can be off or full; the next page then simply opens at the top.
  }
}

/** Reads and forgets the saved position, so it applies to one page load at most. */
function takeSavedScroll(): SavedScroll | undefined {
  try {
    const text = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    return text === null ? undefined : (JSON.parse(text) as SavedScroll);
  } catch {
    return undefined;
  }
}

/** Says whether a click opens the link here, not in a new tab or window. */
function isPlainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.ctrlKey && !event.shiftKey && !event.metaKey && !event.altKey;
}

document.addEventListener('click', (event) => {
  const link = event.target instanceof Element ? event.target.closest('a[data-keep-scroll]') : null;
  if (link instanceof HTMLAnchorElement && isPlainClick(event)) {
    saveScrollFor(link.href);
  }
});

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (form instanceof HTMLFormElement && form.hasAttribute('data-keep-scroll')) {
    const url = new URL(form.action, window.location.href);
    for (const [name, value] of new FormData(form)) {
      url.searchParams.append(name, typeof value === 'string' ? value : value.name);
    }
    saveScrollFor(url.href);
  }
});

const saved = takeSavedScroll();
if (saved?.address === withoutFragment(window.location.href)) {
  window.scrollTo(0, saved.top);
}
