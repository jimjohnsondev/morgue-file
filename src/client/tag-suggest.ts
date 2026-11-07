// Suggestions under a tag field as you type (R10, frame 13): the tags that start with what was
// typed, most used first, then "Create tag" when the text names no tag yet. ↑ and ↓ move through
// them, Enter or a click picks one, Esc closes the list. The list is attached to its field, the
// one thing allowed to drop down (design brief, No pop-ups).

/** A tag the server suggests, and how many items carry it. */
type Suggestion = { readonly name: string; readonly itemCount: number };

/** Waits this long after the last key before asking, so fast typing asks once. */
const TYPING_PAUSE_MS = 120;

/** The list under a field, made the first time the field asks for one. */
function listFor(field: HTMLInputElement): HTMLUListElement {
  const id = `${field.id}-suggestions`;
  const existing = document.getElementById(id);
  if (existing instanceof HTMLUListElement) {
    return existing;
  }
  const list = document.createElement('ul');
  list.id = id;
  list.className = 'suggest__list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Matching tags');
  list.hidden = true;
  field.after(list);
  field.setAttribute('role', 'combobox');
  field.setAttribute('aria-controls', id);
  field.setAttribute('aria-autocomplete', 'list');
  field.setAttribute('aria-expanded', 'false');
  return list;
}

/** One option: the typed part in bold, the rest plain, and a note at the right. */
function optionFor(text: { typed: string; name: string; note: string }, id: string) {
  const option = document.createElement('li');
  option.setAttribute('role', 'option');
  option.dataset.value = text.name;
  option.id = id;
  const label = document.createElement('span');
  if (text.note === 'new') {
    label.textContent = `Create tag “${text.name}”`;
  } else {
    const typedPart = document.createElement('b');
    typedPart.textContent = text.name.slice(0, text.typed.length);
    label.append(typedPart, text.name.slice(text.typed.length));
  }
  const note = document.createElement('span');
  note.className = 'caption';
  note.textContent = text.note;
  option.append(label, note);
  return option;
}

/** Marks one option as the one Enter picks, or none. */
function highlight(field: HTMLInputElement, list: HTMLUListElement, index: number): void {
  const options = [...list.children];
  for (const [place, option] of options.entries()) {
    option.setAttribute('aria-selected', String(place === index));
  }
  const chosen = options[index];
  if (chosen === undefined) {
    field.removeAttribute('aria-activedescendant');
  } else {
    field.setAttribute('aria-activedescendant', chosen.id);
  }
}

/** Shows the suggestions for what is typed, or hides the list if there are none. */
function showSuggestions(field: HTMLInputElement, suggestions: readonly Suggestion[]): void {
  const list = listFor(field);
  const typed = field.value.trim();
  const isKnown = suggestions.some((tag) => tag.name.toLowerCase() === typed.toLowerCase());
  const options = suggestions.map((tag, index) =>
    optionFor({ typed, name: tag.name, note: 'tag' }, `${list.id}-${String(index)}`),
  );
  if (typed !== '' && !isKnown) {
    options.push(
      optionFor({ typed, name: typed, note: 'new' }, `${list.id}-${String(options.length)}`),
    );
  }
  list.replaceChildren(...options);
  list.hidden = options.length === 0 || typed === '';
  field.setAttribute('aria-expanded', String(!list.hidden));
  highlight(field, list, list.hidden ? -1 : 0);
}

/** Hides a field's list. */
function closeList(field: HTMLInputElement): void {
  const list = listFor(field);
  list.hidden = true;
  field.setAttribute('aria-expanded', 'false');
  highlight(field, list, -1);
}

/** Asks the server for the tags that start with what is typed. */
async function fetchSuggestions(field: HTMLInputElement): Promise<void> {
  const typed = field.value.trim();
  if (typed === '') {
    closeList(field);
    return;
  }
  try {
    const response = await fetch(`/api/tags?${new URLSearchParams({ prefix: typed }).toString()}`);
    const answer = (await response.json()) as { tags?: Suggestion[] };
    // Only the answer for what a still-focused field says is shown; an older one is dropped.
    if (field.value.trim() === typed && document.activeElement === field) {
      showSuggestions(field, answer.tags ?? []);
    }
  } catch {
    // No suggestions this time; the tag can still be typed in full.
    closeList(field);
  }
}

/** Fills the field with the chosen option's tag and closes the list. */
function pick(field: HTMLInputElement, option: Element | undefined): void {
  if (option instanceof HTMLElement && option.dataset.value !== undefined) {
    field.value = option.dataset.value;
  }
  closeList(field);
}

/** ↑ ↓ move the highlight, Enter picks it (the next Enter sends the form), Esc closes. */
function onKey(field: HTMLInputElement, event: KeyboardEvent): void {
  const list = listFor(field);
  if (list.hidden) {
    return;
  }
  const options = [...list.children];
  const current = options.findIndex((option) => option.getAttribute('aria-selected') === 'true');
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : options.length - 1;
    highlight(field, list, (current + step) % options.length);
  } else if (event.key === 'Enter' || event.key === 'Escape') {
    event.preventDefault();
    if (event.key === 'Enter') {
      pick(field, options[current]);
    } else {
      closeList(field);
    }
  }
}

/** Hooks one tag field up to its suggestions. */
function startSuggesting(field: HTMLInputElement): void {
  let timer: number | undefined;
  field.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void fetchSuggestions(field), TYPING_PAUSE_MS);
  });
  field.addEventListener('keydown', (event) => {
    onKey(field, event);
  });
  field.addEventListener('blur', () => {
    closeList(field);
  });
  // mousedown, not click: the field keeps the focus, so its blur doesn't close the list first.
  listFor(field).addEventListener('mousedown', (event) => {
    event.preventDefault();
    if (event.target instanceof Element) {
      pick(field, event.target.closest('[role="option"]') ?? undefined);
    }
  });
}

for (const field of document.querySelectorAll<HTMLInputElement>('input[data-tag-suggest]')) {
  startSuggesting(field);
}
