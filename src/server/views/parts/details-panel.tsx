// The Item page's details panel (frames 5, 7, 8): the item's facts, its tags, models and
// collections as chips, then its other fields. It folds to a thin edge (frame 6). Filing (R5),
// tags and collections (R9, R10), models (R15) and the item's own fields (R11) are all edited in
// place.
import { AddModel, AddTag, AddToCollection, ChipGroup } from './details-chips.js';
import { ApiForm, EditButton, EditView, HiddenLabel, SaveOrCancel } from './inline-edit.js';
import { FieldsTable, RatingValue } from './item-fields.js';

import type { CollectionAdding, DetailChip, ModelAdding } from './details-chips.js';
import type { FieldRow, RatingFact } from './item-fields.js';

/** One row of the facts table. A link, the rating or the filing form may go with the text. */
export type FactRow = {
  readonly label: string;
  readonly text: string;
  readonly href?: string;
  /** The Rating row's stars and its [change] form (R11). */
  readonly rating?: RatingFact;
  /** The Subcategory row's [move] form, which files the item by hand (R5). */
  readonly filing?: FilingForm;
};

/** The id of the [move] form; E6's "file it now" opens the item page at #filing. */
export const FILING_FORM_ID = 'filing';

/** What the [move] form offers: its section's subcategories and Unsorted, and where it posts. */
export type FilingForm = {
  readonly action: string;
  readonly choices: readonly { readonly value: string; readonly label: string }[];
  readonly current: string;
};

/** Everything the details panel shows. */
export type DetailsModel = {
  readonly facts: readonly FactRow[];
  readonly tags: readonly DetailChip[];
  readonly models: readonly DetailChip[];
  /** The "add model" form: its action, choices and label; in the reader, the pages on show. */
  readonly modelAdding: ModelAdding;
  readonly collections: readonly DetailChip[];
  /** Where Add tag posts (R10). */
  readonly tagAction: string;
  readonly collectionAdding: CollectionAdding;
  readonly fields: readonly FieldRow[];
  /** Where each field's form posts (R11). */
  readonly fieldAction: string;
  readonly hideHref: string;
  /** Where "Turn back into photos" posts, for a folder made a publication by hand. */
  readonly publicationUndo?: string;
};

/** The [move] form, in place of the subcategory's name while it is open. */
function FilingFields(props: { readonly filing: FilingForm }) {
  const { filing } = props;
  return (
    <ApiForm action={filing.action} editId={FILING_FORM_ID} label="File this item">
      <HiddenLabel for="filing-subcategory">Subcategory</HiddenLabel>
      <select id="filing-subcategory" name="subcategory" class="field">
        {filing.choices.map((choice) => (
          <option
            key={choice.value}
            value={choice.value}
            selected={choice.value === filing.current}
          >
            {choice.label}
          </option>
        ))}
      </select>{' '}
      <SaveOrCancel />
    </ApiForm>
  );
}

/** The Subcategory fact: its name and [move], which opens the filing form in its place. */
function FilingValue(props: { readonly row: FactRow; readonly filing: FilingForm }) {
  return (
    <td>
      <EditView formId={FILING_FORM_ID}>
        {props.row.text} [<EditButton formId={FILING_FORM_ID} label="move" />]
      </EditView>
      <FilingFields filing={props.filing} />
    </td>
  );
}

/** The value cell of a fact: text or a link, or the rating and filing forms. */
function FactValue(props: { readonly row: FactRow }) {
  const { row } = props;
  if (row.filing !== undefined) {
    return <FilingValue row={row} filing={row.filing} />;
  }
  if (row.rating !== undefined) {
    return <RatingValue fact={row.rating} />;
  }
  return <td>{row.href === undefined ? row.text : <a href={row.href}>{row.text}</a>}</td>;
}

/** The open details panel, 400 px beside the viewer. */
export function DetailsPanel(props: { readonly model: DetailsModel }) {
  const { model } = props;
  return (
    <aside aria-label="Details" class="panel details-panel">
      <h2 class="panel__title panel__title--split">
        <span>Details</span>
        <a href={model.hideHref}>hide »</a>
      </h2>
      <div class="panel__body details-panel__body">
        <table class="details-table">
          <tbody>
            {model.facts.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <FactValue row={row} />
              </tr>
            ))}
          </tbody>
        </table>
        <ChipGroup title="Tags" chips={model.tags} removeName={(tag) => `Remove tag ${tag}`}>
          <AddTag action={model.tagAction} />
        </ChipGroup>
        <ChipGroup
          title="Models"
          chips={model.models}
          removeName={(name) => `Remove model ${name}`}
          add={<AddModel adding={model.modelAdding} />}
        />
        <ChipGroup
          title="Collections"
          chips={model.collections}
          removeName={(name) => `Remove from ${name}`}
          {...(model.collectionAdding.choices.length > 0 && {
            add: <AddToCollection adding={model.collectionAdding} />,
          })}
        />
        <FieldsTable fields={model.fields} action={model.fieldAction} />
        <span class="caption">
          <a href="/settings">Edit fields</a>
        </span>
        {model.publicationUndo !== undefined && <PublicationUndo action={model.publicationUndo} />}
      </div>
    </aside>
  );
}

/** For a folder made a publication by hand: a note, and the way back to loose photos. */
function PublicationUndo(props: { readonly action: string }) {
  return (
    <ApiForm action={props.action} next="/photos" label="Turn back into photos">
      <span class="caption">Made from a folder of photos.</span>{' '}
      <button type="submit" class="button">
        Turn back into photos
      </button>
    </ApiForm>
  );
}

/** The folded panel: a 34 px edge with a « link to open it again (frame 6). */
export function DetailsEdge(props: { readonly showHref: string }) {
  return (
    <aside aria-label="Details, hidden" class="details-edge">
      <a href={props.showHref} aria-label="Show details" class="details-edge__link">
        «
      </a>
      <span class="details-edge__label">Details</span>
      <span class="details-edge__square" />
    </aside>
  );
}
