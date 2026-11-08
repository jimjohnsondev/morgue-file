// The Item page's details panel (frames 5, 7, 8): the item's facts, its tags, models and
// collections as chips, then its other fields. It folds to a thin edge (frame 6). Filing (PR 13),
// tags and collections (PR 14) and models (PR 17) are edited in place; the field controls are
// drawn as the frames show them and come alive with PR 18.
import { AddModel, AddTag, AddToCollection, ChipGroup } from './details-chips.js';
import { FieldText } from './field-text.js';
import { ApiForm, EditButton, EditView, HiddenLabel, SaveOrCancel } from './inline-edit.js';
import { PendingAction } from './pending-action.js';

import type { FieldType } from '#core/db/repositories/fields.js';
import type { CollectionAdding, DetailChip, ModelAdding } from './details-chips.js';

/** One row of the facts table. A link, a rating or a pending edit action may go with the text. */
export type FactRow = {
  readonly label: string;
  readonly text: string;
  readonly href?: string;
  /** Stars out of 5, read out as "4 of 5". */
  readonly stars?: { readonly text: string; readonly rating: number };
  /** The edit link after the value: [move], [change]. */
  readonly action?: string;
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

/** One of the item's own fields (notes, source URL…), rendered by its type (R11). */
export type FieldRow = {
  readonly key: string;
  readonly label: string;
  readonly type: FieldType;
  readonly text: string | undefined;
};

/** Everything the details panel shows. */
export type DetailsModel = {
  readonly facts: readonly FactRow[];
  readonly tags: readonly DetailChip[];
  readonly models: readonly DetailChip[];
  /** "add model", or "add model to pages 12–13" in the reader. */
  readonly modelAdding: ModelAdding;
  readonly collections: readonly DetailChip[];
  /** Where Add tag posts (R10). */
  readonly tagAction: string;
  readonly collectionAdding: CollectionAdding;
  readonly fields: readonly FieldRow[];
  readonly hideHref: string;
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

/** The value cell of a fact: text or a link, stars, and the edit action in brackets. */
function FactValue(props: { readonly row: FactRow }) {
  const { row } = props;
  if (row.filing !== undefined) {
    return <FilingValue row={row} filing={row.filing} />;
  }
  return (
    <td>
      {row.stars === undefined &&
        (row.href === undefined ? row.text : <a href={row.href}>{row.text}</a>)}
      {row.stars !== undefined && (
        <span class="rating" aria-label={`${String(row.stars.rating)} of 5`}>
          {row.stars.text}
        </span>
      )}
      {row.action !== undefined && (
        <>
          {' '}
          [<PendingAction label={row.action} />]
        </>
      )}
    </td>
  );
}

/** A field's value as its type reads; long text is a box, as notes are edited in place. */
function FieldValue(props: { readonly row: FieldRow }) {
  const { row } = props;
  if (row.type === 'longtext') {
    return (
      <textarea id={`field-${row.key}`} class="field details-field__text" rows={4} disabled>
        {row.text ?? ''}
      </textarea>
    );
  }
  return <FieldText type={row.type} text={row.text} />;
}

/** The fields table: short values first, then long text boxes such as notes. */
function FieldsTable(props: { readonly fields: readonly FieldRow[] }) {
  const ordered = [
    ...props.fields.filter((row) => row.type !== 'longtext'),
    ...props.fields.filter((row) => row.type === 'longtext'),
  ];
  return (
    <table class="details-table">
      <tbody>
        {ordered.map((row) => (
          <tr key={row.key}>
            <th scope="row">
              {row.type === 'longtext' ? (
                <label for={`field-${row.key}`}>{row.label}</label>
              ) : (
                row.label
              )}
            </th>
            <td>
              <FieldValue row={row} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
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
        <FieldsTable fields={model.fields} />
        <span class="caption">
          <a href="/settings">Edit fields</a>
        </span>
      </div>
    </aside>
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
