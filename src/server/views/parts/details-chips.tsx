// The chip groups of the Item page's details panel (frames 5, 7, 8): tags, models and
// collections, each chip with its [x], then the way to add one. Tags and collections are edited
// in place (R9, R10, R37); the models' controls are drawn until model tagging arrives (PR 17).
import {
  ApiAction,
  ApiForm,
  EditButton,
  EditView,
  HiddenLabel,
  SaveOrCancel,
} from './inline-edit.js';
import { PendingAction } from './pending-action.js';

import type { ComponentChildren } from 'preact';

/** A chip linking somewhere, such as a model, with a note after it ("pages 12–19"). */
export type DetailChip = {
  readonly label: string;
  readonly href?: string;
  readonly note?: { readonly text: string; readonly href: string };
  /** Where its [x] sends a DELETE; without one the [x] is drawn but does nothing yet. */
  readonly removeAction?: string;
};

/** The id of the "add to collection" form, opened in place of its link. */
const ADD_COLLECTION_FORM_ID = 'add-collection';

/** The collections the item can be added to, and where the choice is posted (R9). */
export type CollectionAdding = {
  readonly action: string;
  readonly choices: readonly { readonly value: string; readonly label: string }[];
};

/** A chip's [x]: a DELETE once its edit is built, else drawn but doing nothing yet. */
function RemoveChip(props: { readonly chip: DetailChip; readonly name: string }) {
  const { chip, name } = props;
  return chip.removeAction === undefined ? (
    <PendingAction label="x" name={name} />
  ) : (
    <ApiAction action={chip.removeAction} method="DELETE" label="x" name={name} />
  );
}

/** One group of chips under its heading, then the way to add one; "None" when it has none. */
export function ChipGroup(props: {
  readonly title: string;
  readonly chips: readonly DetailChip[];
  readonly removeName: (label: string) => string;
  /** The link or form after the chips that adds one: "add model", "add to collection". */
  readonly add?: ComponentChildren;
  readonly children?: ComponentChildren;
}) {
  const { chips, add } = props;
  return (
    <div class="details-group">
      <h3 class="details-group__title">{props.title}</h3>
      <div class="details-group__chips">
        {chips.length === 0 && add !== undefined && (
          <span class="details-group__none">None · </span>
        )}
        {chips.map((chip) => (
          <span key={chip.label} class="chip">
            <span>
              {chip.href === undefined ? chip.label : <a href={chip.href}>{chip.label}</a>}
              {chip.note && (
                <>
                  , <a href={chip.note.href}>{chip.note.text}</a>
                </>
              )}
            </span>
            <RemoveChip chip={chip} name={props.removeName(chip.label)} />
          </span>
        ))}
        {add}
      </div>
      {props.children}
    </div>
  );
}

/** Add tag: a field with suggestions as you type (client/tag-suggest.ts) and its button. */
export function AddTag(props: { readonly action: string }) {
  return (
    <ApiForm action={props.action} label="Add a tag">
      <div class="details-add">
        <label for="add-tag" class="caption">
          Add tag
        </label>
        <span class="suggest details-add__field">
          <input
            id="add-tag"
            name="tag"
            class="field suggest__field"
            autocomplete="off"
            data-tag-suggest
          />
        </span>
        <button type="submit" class="button">
          Add
        </button>
      </div>
    </ApiForm>
  );
}

/** "add to collection", which opens a list of the collections the item isn't in yet. */
export function AddToCollection(props: { readonly adding: CollectionAdding }) {
  const { adding } = props;
  return (
    <>
      <EditView formId={ADD_COLLECTION_FORM_ID}>
        <EditButton formId={ADD_COLLECTION_FORM_ID} label="add to collection" />
      </EditView>
      <ApiForm action={adding.action} editId={ADD_COLLECTION_FORM_ID} label="Add to a collection">
        <HiddenLabel for="add-collection-choice">Collection</HiddenLabel>
        <select id="add-collection-choice" name="collection" class="field">
          {adding.choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>{' '}
        <SaveOrCancel saveLabel="Add" />
      </ApiForm>
    </>
  );
}
