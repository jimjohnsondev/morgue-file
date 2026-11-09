// The model tags on the profile editor (frame 14): a chip per tag with its x, and a box to add
// one. client/model-tag-editor.ts adds and removes chips on the page and keeps the hidden list
// the form sends; the tags are saved with the rest of the profile.

/** One tag's chip; its x takes the chip away until the profile is saved. */
function TagChip(props: { readonly tag: string }) {
  return (
    <span class="chip" data-tag-chip={props.tag}>
      <span data-tag-name>{props.tag}</span>
      <button
        type="button"
        class="link-button"
        aria-label={`Remove tag ${props.tag}`}
        data-tag-remove
      >
        x
      </button>
    </span>
  );
}

/** The chips, the add box and its button, and the hidden list of tags the form sends. */
export function ModelTagEditor(props: { readonly tags: readonly string[] }) {
  return (
    <div class="tag-editor" data-tag-editor>
      <input type="hidden" name="tags" value={props.tags.join('\n')} data-tag-list />
      <span class="tag-editor__chips" data-tag-chips>
        {props.tags.map((tag) => (
          <TagChip key={tag} tag={tag} />
        ))}
      </span>
      <span class="tag-editor__add">
        <label for="model-tag-new" class="caption">
          add
        </label>
        <input id="model-tag-new" class="field tag-editor__field" data-tag-new />
        <button type="button" class="button" data-tag-add>
          Add
        </button>
      </span>
      <template data-tag-template>
        <TagChip tag="" />
      </template>
    </div>
  );
}
