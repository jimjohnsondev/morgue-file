// The Item page's keys (R19): ← and → follow Prev and Next through the list the item was opened
// from, V switches viewing mode (frame 9) on and off, and Esc leaves it. In the page reader, ← and
// → turn the pages first, and only before the first or past the last page move to another item.
// Viewing mode is kept in the URL, so it lasts from one reference to the next.
import { followFirstKeyLink, followKeyLink, onPageKeys } from './keys.js';

/** The class on <body> that hides every part of the page but the viewer. */
const VIEWING_CLASS = 'viewing-mode';

/** Sets or clears `mode=viewing` in an Item page address. */
function withViewingMode(address: string, isViewing: boolean): string {
  const url = new URL(address, window.location.href);
  if (isViewing) {
    url.searchParams.set('mode', 'viewing');
  } else {
    url.searchParams.delete('mode');
  }
  return `${url.pathname}${url.search}`;
}

/** Keeps the jump-to-page form's hidden mode field in step with viewing mode. */
function updateForms(isViewing: boolean): void {
  for (const form of document.querySelectorAll<HTMLFormElement>('form[action^="/item/"]')) {
    const field = form.querySelector<HTMLInputElement>('input[name="mode"]');
    if (isViewing && field === null) {
      form.append(
        Object.assign(document.createElement('input'), {
          type: 'hidden',
          name: 'mode',
          value: 'viewing',
        }),
      );
    } else if (!isViewing) {
      field?.remove();
    }
  }
}

/** Turns viewing mode on or off, and makes every link to an item page carry the choice. */
function setViewing(isViewing: boolean): void {
  document.body.classList.toggle(VIEWING_CLASS, isViewing);
  window.history.replaceState(null, '', withViewingMode(window.location.href, isViewing));
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href^="/item/"]')) {
    link.setAttribute('href', withViewingMode(link.getAttribute('href') ?? '', isViewing));
  }
  updateForms(isViewing);
}

/** Says whether viewing mode is on. */
function isViewing(): boolean {
  return document.body.classList.contains(VIEWING_CLASS);
}

if (document.querySelector('.item-page') !== null) {
  onPageKeys({
    // The reader's page links are absent on its first and last pages, so the item links take over.
    ArrowLeft: () => {
      followFirstKeyLink(['page-previous', 'previous']);
    },
    ArrowRight: () => {
      followFirstKeyLink(['page-next', 'next']);
    },
    v: () => {
      setViewing(!isViewing());
    },
    V: () => {
      setViewing(!isViewing());
    },
    Escape: () => {
      setViewing(false);
    },
  });
  for (const link of document.querySelectorAll('[data-viewing-toggle]')) {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      setViewing(true);
    });
  }
}

// An Index page: ← and → turn its pages, through the pager's Prev and Next.
if (document.querySelector('.item-page') === null && document.querySelector('.pager') !== null) {
  onPageKeys({
    ArrowLeft: () => {
      followKeyLink('previous');
    },
    ArrowRight: () => {
      followKeyLink('next');
    },
  });
}
