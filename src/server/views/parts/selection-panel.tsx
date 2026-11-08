// The action panel above the grid in selection mode (frame 13): choose what is selected, then
// tag it, link it to a model, add it to a collection or a new one, or move it to a subcategory,
// all in place on the page (R10, R15, R37). client/selection.ts keeps the count and tick boxes
// current, and client/bulk-actions.ts sends each form with what is selected.
import { ModelChoiceFields } from './model-choice.js';

import type { ModelOption } from './model-choice.js';
import type { ComponentChildren } from 'preact';

/** A choice in a select list: what it sends, and what it says. */
export type Choice = {
  readonly value: string;
  readonly label: string;
};

/** Choices under a heading, as an `<optgroup>`; a group with no heading is listed bare. */
export type ChoiceGroup = {
  readonly heading?: string;
  readonly choices: readonly Choice[];
};

/** Everything the action panel shows. */
export type SelectionPanelModel = {
  /** The same list with selection mode off. */
  readonly doneHref: string;
  /** The list's canonical query, for "all 1,236 in Figure". */
  readonly query: string;
  /** How many items the whole list holds. */
  readonly total: number;
  /** "all 1,236 in Figure", or "all 38 results". */
  readonly allLabel: string;
  readonly models: readonly ModelOption[];
  readonly collections: readonly Choice[];
  /** The collection this page lists, which its items can be taken out of. */
  readonly currentCollection: Choice | undefined;
  readonly subcategories: readonly ChoiceGroup[];
};

/** One labelled group of controls, set off from the next by a dotted rule. */
function Group(props: {
  readonly label: ComponentChildren;
  /** A modifier for a group that is laid out differently: `tag` is the wide one. */
  readonly modifier?: string;
  readonly children: ComponentChildren;
}) {
  const modifier = props.modifier === undefined ? '' : ` selection-group--${props.modifier}`;
  return (
    <div class={`selection-group${modifier}`}>
      {props.label}
      {props.children}
    </div>
  );
}

/** A form the panel sends with the selection; each submit button names where it goes. */
function BulkForm(props: { readonly label: string; readonly children: ComponentChildren }) {
  return (
    <form class="selection-form" data-bulk-form aria-label={props.label}>
      {props.children}
    </form>
  );
}

/** A button that sends its form to one action, and says what was done once it has. */
function BulkButton(props: {
  readonly action: string;
  readonly done: string;
  readonly children: ComponentChildren;
}) {
  return (
    <button
      type="submit"
      class="button"
      data-bulk-action={props.action}
      data-bulk-done={props.done}
    >
      {props.children}
    </button>
  );
}

/** The options of a select list. */
function ChoiceOptions(props: { readonly choices: readonly Choice[] }) {
  return (
    <>
      {props.choices.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </>
  );
}

/** A select list of choices, grouped under headings when there are several sections. */
function ChoiceSelect(props: {
  readonly id: string;
  readonly name: string;
  readonly groups: readonly ChoiceGroup[];
}) {
  return (
    <select id={props.id} name={props.name} class="field">
      {props.groups.map((group) =>
        group.heading === undefined ? (
          <ChoiceOptions key={group.choices[0]?.value ?? 'none'} choices={group.choices} />
        ) : (
          <optgroup key={group.heading} label={group.heading}>
            <ChoiceOptions choices={group.choices} />
          </optgroup>
        ),
      )}
    </select>
  );
}

/** Select all on the page, the whole list, or none. */
function SelectGroup(props: { readonly model: SelectionPanelModel }) {
  return (
    <Group label={<span class="selection-group__label">Select</span>}>
      <span class="selection-group__links">
        <button type="button" class="link-button" data-select="page">
          all on this page
        </button>{' '}
        ·{' '}
        <button type="button" class="link-button" data-select="list">
          {props.model.allLabel}
        </button>{' '}
        ·{' '}
        <button type="button" class="link-button" data-select="none">
          none
        </button>
      </span>
      <span class="caption">shift-click selects a run</span>
    </Group>
  );
}

/** Tag: a field with suggestions as you type, Add and Remove, and the selection's tags. */
function TagGroup() {
  return (
    <Group
      modifier="tag"
      label={
        <label for="selection-tag" class="selection-group__label">
          Tag
        </label>
      }
    >
      <BulkForm label="Tag the selected items">
        <span class="suggest selection-form__grow">
          <input
            id="selection-tag"
            name="tag"
            class="field suggest__field"
            autocomplete="off"
            data-tag-suggest
          />
        </span>
        <BulkButton action="/api/selection/tag" done="Tagged {items}.">
          {/* A button is a flex box, which drops the space before an element; one span keeps it. */}
          <span>
            Add to <span data-selection-count="number">0</span>
          </span>
        </BulkButton>
        <BulkButton action="/api/selection/untag" done="Took the tag off {items}.">
          Remove
        </BulkButton>
      </BulkForm>
      <span class="caption selection-tags" data-selection-tags hidden>
        on all selected: <span data-selection-tag-chips />
      </span>
    </Group>
  );
}

/** Model: links the selection to a model in the list, or to a new one (R15). */
function ModelGroup(props: { readonly models: readonly ModelOption[] }) {
  return (
    <Group
      label={
        <label for="selection-model" class="selection-group__label">
          Model
        </label>
      }
    >
      <BulkForm label="Link the selected items to a model">
        <ModelChoiceFields id="selection-model" models={props.models} />
        <BulkButton action="/api/selection/model" done="Linked {items} to the model.">
          Add
        </BulkButton>
      </BulkForm>
    </Group>
  );
}

/** Collection: add to one, take out of the one this page lists, or make a new one (R9). */
function CollectionGroup(props: { readonly model: SelectionPanelModel }) {
  const { collections, currentCollection } = props.model;
  return (
    <Group
      label={
        <label for="selection-collection" class="selection-group__label">
          Collection
        </label>
      }
    >
      {collections.length > 0 && (
        <BulkForm label="Add the selected items to a collection">
          <ChoiceSelect
            id="selection-collection"
            name="collection"
            groups={[{ choices: collections }]}
          />
          <BulkButton action="/api/selection/collect" done="Added {items} to the collection.">
            Add
          </BulkButton>
        </BulkForm>
      )}
      <BulkForm label="Make a collection of the selected items">
        <label for="selection-new-collection" class="caption">
          or new
        </label>
        <input
          id="selection-new-collection"
          name="name"
          class="field selection-form__name"
          placeholder="collection name"
        />
        <BulkButton action="/api/selection/new-collection" done="Made the collection with {items}.">
          Create
        </BulkButton>
      </BulkForm>
      {currentCollection && (
        <BulkForm label="Take the selected items out of this collection">
          <input type="hidden" name="collection" value={currentCollection.value} />
          <BulkButton action="/api/selection/uncollect" done="Took {items} out of this collection.">
            Remove from {currentCollection.label}
          </BulkButton>
        </BulkForm>
      )}
    </Group>
  );
}

/** Move to subcategory: files the selection by hand; the files stay where they are (R5). */
function FilingGroup(props: { readonly groups: readonly ChoiceGroup[] }) {
  return (
    <Group
      label={
        <label for="selection-subcategory" class="selection-group__label">
          Move to subcategory
        </label>
      }
    >
      <BulkForm label="Move the selected items to a subcategory">
        <ChoiceSelect id="selection-subcategory" name="subcategory" groups={props.groups} />
        <BulkButton action="/api/selection/file" done="Filed {items}.">
          Move
        </BulkButton>
      </BulkForm>
      <span class="caption">files stay where they are on disk</span>
    </Group>
  );
}

/** The action panel, its title bar in the edit-mode magenta. */
export function SelectionPanel(props: { readonly model: SelectionPanelModel }) {
  const { model } = props;
  return (
    <section
      aria-label="Edit selected items"
      class="panel selection-panel"
      data-selection-panel
      data-selection-query={model.query}
      data-selection-total={String(model.total)}
    >
      <h2 class="panel__title panel__title--split panel__title--edit">
        <span data-selection-count="title">0 selected on this page</span>
        <a href={model.doneHref}>done selecting</a>
      </h2>
      <div class="panel__body selection-panel__body">
        <SelectGroup model={model} />
        <TagGroup />
        <ModelGroup models={model.models} />
        <CollectionGroup model={model} />
        <FilingGroup groups={model.subcategories} />
      </div>
      <p class="selection-panel__result" role="status" data-selection-result hidden />
    </section>
  );
}
