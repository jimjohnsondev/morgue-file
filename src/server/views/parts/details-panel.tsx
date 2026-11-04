// The Item page's details panel (frames 5, 7, 8): the item's facts, its tags, models and
// collections as chips, then its other fields. It folds to a thin edge (frame 6). The editing
// controls are drawn as the frames show them and come alive with the editing PRs (13, 14, 17, 18).
import { formatLinkText } from '../format.js';

import type { FieldType } from '#core/db/repositories/fields.js';
import type { ComponentChildren } from 'preact';

/** One row of the facts table. A link, a rating or a pending edit action may go with the text. */
export type FactRow = {
  readonly label: string;
  readonly text: string;
  readonly href?: string;
  /** Stars out of 5, read out as "4 of 5". */
  readonly stars?: { readonly text: string; readonly rating: number };
  /** The edit link after the value: [move], [change]. */
  readonly action?: string;
};

/** A chip linking somewhere, such as a model, with a note after it ("pages 12–19"). */
export type DetailChip = {
  readonly label: string;
  readonly href?: string;
  readonly note?: { readonly text: string; readonly href: string };
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
  readonly addModelLabel: string;
  readonly collections: readonly DetailChip[];
  readonly fields: readonly FieldRow[];
  readonly hideHref: string;
};

/** A link-styled button for an edit action that isn't built yet, so it does nothing. */
function PendingAction(props: { readonly label: string; readonly name?: string }) {
  return (
    <button type="button" class="link-button" disabled aria-label={props.name}>
      {props.label}
    </button>
  );
}

/** The value cell of a fact: text or a link, stars, and the edit action in brackets. */
function FactValue(props: { readonly row: FactRow }) {
  const { row } = props;
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

/** One group of chips under its heading, with what to show when there are none. */
function ChipGroup(props: {
  readonly title: string;
  readonly chips: readonly DetailChip[];
  readonly removeName: (label: string) => string;
  readonly addLabel?: string;
  readonly children?: ComponentChildren;
}) {
  const { chips, addLabel } = props;
  return (
    <div class="details-group">
      <h3 class="details-group__title">{props.title}</h3>
      <div class="details-group__chips">
        {chips.length === 0 && addLabel !== undefined && (
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
            <PendingAction label="x" name={props.removeName(chip.label)} />
          </span>
        ))}
        {addLabel !== undefined && <PendingAction label={addLabel} />}
      </div>
      {props.children}
    </div>
  );
}

/** A field's value as its type reads: links link, empty values say "none". */
function FieldValue(props: { readonly row: FieldRow }) {
  const { row } = props;
  if (row.type === 'longtext') {
    return (
      <textarea id={`field-${row.key}`} class="field details-field__text" rows={4} disabled>
        {row.text ?? ''}
      </textarea>
    );
  }
  if (row.text === undefined) {
    return <span class="caption">none</span>;
  }
  // Only web addresses become links, so a stored value can never run script when clicked.
  const isWebLink = row.type === 'link' && /^https?:\/\//i.test(row.text);
  return isWebLink ? <a href={row.text}>{formatLinkText(row.text)}</a> : <>{row.text}</>;
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
          <div class="details-add">
            <label for="add-tag" class="caption">
              Add tag
            </label>
            <input id="add-tag" class="field details-add__field" disabled />
            <button type="button" class="button" disabled>
              Add
            </button>
          </div>
        </ChipGroup>
        <ChipGroup
          title="Models"
          chips={model.models}
          removeName={(name) => `Remove model ${name}`}
          addLabel={model.addModelLabel}
        />
        <ChipGroup
          title="Collections"
          chips={model.collections}
          removeName={(name) => `Remove from ${name}`}
          addLabel="add to collection"
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
