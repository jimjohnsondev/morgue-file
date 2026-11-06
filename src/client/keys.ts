// Shared keyboard handling for the page's key behaviors: each module listens for its own keys,
// and none of them fires while a focused control wants the key, or Ctrl, Alt or Windows is held.

/** Input types that take no typing, so letter keys still belong to the page. */
const KEYLESS_INPUTS: ReadonlySet<string> = new Set(['range', 'checkbox', 'radio', 'button']);

/**
 * Says whether a key press belongs to a focused control, not to the page: anything typed into a
 * field, or the arrow keys that move a slider such as the video's scrub bar.
 */
export function isKeyForControl(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target instanceof HTMLInputElement && KEYLESS_INPUTS.has(target.type)) {
    return event.key.startsWith('Arrow');
  }
  return target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
}

/**
 * Calls a handler for page keys: the key's name (`ArrowLeft`, `v`) is looked up in the map, and
 * a handler found there runs and takes the key from the browser.
 */
export function onPageKeys(handlers: Readonly<Record<string, () => void>>): void {
  document.addEventListener('keydown', (event) => {
    if (isKeyForControl(event) || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    const handler = handlers[event.key];
    if (handler !== undefined) {
      event.preventDefault();
      handler();
    }
  });
}

/** Follows the link marked with this data-key-link name, if the page has one. */
export function followKeyLink(name: string): void {
  const link = document.querySelector<HTMLAnchorElement>(`a[data-key-link="${name}"]`);
  if (link !== null) {
    window.location.assign(link.href);
  }
}
