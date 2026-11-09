// The model tags on the profile editor (frame 14): Add (or Enter in the box) puts a chip on the
// page, a chip's x takes it away, and the hidden list the form sends follows the chips. Nothing
// is saved until Save profile, with the rest of the profile.

/** The parts of one tag editor, found by their data- attributes. */
type TagEditorParts = {
  readonly list: HTMLInputElement;
  readonly chips: HTMLElement;
  readonly field: HTMLInputElement;
  readonly template: HTMLTemplateElement;
};

/** Finds a tag editor's parts, or undefined if the markup lacks one. */
function findParts(editor: Element): TagEditorParts | undefined {
  const list = editor.querySelector<HTMLInputElement>('[data-tag-list]');
  const chips = editor.querySelector<HTMLElement>('[data-tag-chips]');
  const field = editor.querySelector<HTMLInputElement>('[data-tag-new]');
  const template = editor.querySelector<HTMLTemplateElement>('template[data-tag-template]');
  if (list === null || chips === null || field === null || template === null) {
    return undefined;
  }
  return { list, chips, field, template };
}

/** The tags the chips now show, in order. */
function chipTags(parts: TagEditorParts): string[] {
  return [...parts.chips.querySelectorAll<HTMLElement>('[data-tag-chip]')].map(
    (chip) => chip.dataset.tagChip ?? '',
  );
}

/** Writes the chips' tags into the hidden list, one per line, as the server reads them. */
function updateList(parts: TagEditorParts): void {
  parts.list.value = chipTags(parts).join('\n');
}

/** Adds the typed tag as a chip, unless it is blank or already there, and empties the box. */
function addTypedTag(parts: TagEditorParts): void {
  const tag = parts.field.value.trim();
  parts.field.value = '';
  if (tag === '' || chipTags(parts).includes(tag)) {
    return;
  }
  const chip = parts.template.content.firstElementChild?.cloneNode(true);
  if (!(chip instanceof HTMLElement)) {
    return;
  }
  chip.dataset.tagChip = tag;
  const name = chip.querySelector('[data-tag-name]');
  if (name !== null) {
    name.textContent = tag;
  }
  chip.querySelector('[data-tag-remove]')?.setAttribute('aria-label', `Remove tag ${tag}`);
  parts.chips.append(chip);
  updateList(parts);
}

/** Adds a tag, or takes a chip away, for a click inside a tag editor. */
function onClick(target: Element): void {
  const editor = target.closest('[data-tag-editor]');
  const parts = editor === null ? undefined : findParts(editor);
  if (parts === undefined) {
    return;
  }
  if (target.closest('[data-tag-add]') !== null) {
    addTypedTag(parts);
    parts.field.focus();
  }
  const removed = target.closest('[data-tag-remove]')?.closest('[data-tag-chip]');
  if (removed !== null && removed !== undefined) {
    removed.remove();
    updateList(parts);
    parts.field.focus();
  }
}

document.addEventListener('click', (event) => {
  if (event.target instanceof Element) {
    onClick(event.target);
  }
});

// Enter in the add box adds the tag rather than saving the whole profile half-typed.
document.addEventListener('keydown', (event) => {
  const field = event.target instanceof Element ? event.target.closest('[data-tag-new]') : null;
  const editor = field?.closest('[data-tag-editor]');
  const parts = editor === null || editor === undefined ? undefined : findParts(editor);
  if (event.key === 'Enter' && parts !== undefined) {
    event.preventDefault();
    addTypedTag(parts);
  }
});
