// An item's own fields in its details panel (frames 5, 7, 8; R11), edited in place (R37): the
// rating's [change], a [change] after each short value, and the notes box, which saves itself
// when it loses the focus (client/save-on-change.ts). Whatever fields the fields table holds are
// drawn, so a field added in Settings shows here with no code change.
import { formatStars } from '../format.js';

import { FieldText } from './field-text.js';
import { ApiForm, EditButton, EditView, HiddenLabel, SaveOrCancel } from './inline-edit.js';
import { ProfileFieldInput } from './profile-field-input.js';

import type { FieldType } from '#core/db/repositories/fields.js';
import type { FieldBox } from './profile-field-input.js';

/** One of the item's own fields (notes, source URL…), shown by its type and edited in place. */
export type FieldRow = {
  readonly key: string;
  readonly label: string;
  readonly type: FieldType;
  /** The value as the panel shows it (a date written out), or undefined for "none". */
  readonly text: string | undefined;
  /** The value as its box holds it. */
  readonly box: FieldBox;
};

/** The rating fact: its stars if it is rated, and where its [change] form posts. */
export type RatingFact = {
  readonly label: string;
  readonly rating: number | undefined;
  readonly action: string;
};

/** The ratings the [change] list offers, most stars first, as the stars read. */
const RATINGS = [5, 4, 3, 2, 1];

/** The id of a field's form, which its [change] opens. */
function fieldFormId(key: string): string {
  return `field-form-${key}`;
}

/** The id of a field's box, which its label names. */
function fieldBoxId(key: string): string {
  return `field-${key}`;
}

/** The field's key, sent with every form so one route saves them all. */
function FieldKey(props: { readonly fieldKey: string }) {
  return <input type="hidden" name="key" value={props.fieldKey} />;
}

/** The rating's value cell: its stars or "none", and [change], which opens a list of ratings. */
export function RatingValue(props: { readonly fact: RatingFact }) {
  const { fact } = props;
  const formId = fieldFormId('rating');
  return (
    <td>
      <EditView formId={formId}>
        {fact.rating === undefined ? (
          'none'
        ) : (
          <span class="rating" aria-label={`${String(fact.rating)} of 5`}>
            {formatStars(fact.rating)}
          </span>
        )}{' '}
        [<EditButton formId={formId} label="change" name={`Change ${fact.label}`} />]
      </EditView>
      <ApiForm action={fact.action} editId={formId} label={`Change ${fact.label}`}>
        <FieldKey fieldKey="rating" />
        <HiddenLabel for={fieldBoxId('rating')}>{fact.label}</HiddenLabel>
        <select id={fieldBoxId('rating')} name="value" class="field">
          <option value="">none</option>
          {RATINGS.map((stars) => (
            <option key={stars} value={String(stars)} selected={stars === fact.rating}>
              {`${String(stars)} ${formatStars(stars)}`}
            </option>
          ))}
        </select>{' '}
        <SaveOrCancel />
      </ApiForm>
    </td>
  );
}

/** A short value and its [change], which opens the field's box in its place. */
function ShortFieldValue(props: { readonly row: FieldRow; readonly action: string }) {
  const { row, action } = props;
  const formId = fieldFormId(row.key);
  return (
    <td>
      <EditView formId={formId}>
        <FieldText type={row.type} text={row.text} /> [
        <EditButton formId={formId} label="change" name={`Change ${row.label}`} />]
      </EditView>
      <ApiForm action={action} editId={formId} label={`Change ${row.label}`}>
        <FieldKey fieldKey={row.key} />
        <HiddenLabel for={fieldBoxId(row.key)}>{row.label}</HiddenLabel>
        <ProfileFieldInput id={fieldBoxId(row.key)} name="value" field={row.box} /> <SaveOrCancel />
      </ApiForm>
    </td>
  );
}

/** A long text box such as notes, saved when it loses the focus, without leaving the page. */
function LongFieldValue(props: { readonly row: FieldRow; readonly action: string }) {
  const { row, action } = props;
  return (
    <td>
      <ApiForm action={action} id={fieldFormId(row.key)} label={row.label} isSavedInPlace>
        <FieldKey fieldKey={row.key} />
        <textarea
          id={fieldBoxId(row.key)}
          name="value"
          class="field details-field__text"
          rows={4}
          maxLength={20_000}
          data-save-on-change
        >
          {row.box.value}
        </textarea>
      </ApiForm>
    </td>
  );
}

/** The fields table: short values first, then long text boxes such as notes. */
export function FieldsTable(props: {
  readonly fields: readonly FieldRow[];
  readonly action: string;
}) {
  const { action } = props;
  const ordered = [
    ...props.fields.filter((row) => row.type !== 'longtext'),
    ...props.fields.filter((row) => row.type === 'longtext'),
  ];
  return (
    <table class="details-table">
      <tbody>
        {ordered.map((row) =>
          row.type === 'longtext' ? (
            <tr key={row.key}>
              <th scope="row">
                <label for={fieldBoxId(row.key)}>{row.label}</label>
              </th>
              <LongFieldValue row={row} action={action} />
            </tr>
          ) : (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              <ShortFieldValue row={row} action={action} />
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}
