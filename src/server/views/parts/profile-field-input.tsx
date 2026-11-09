// A field's box, drawn by the field's type: a line for short text, a box for long text, an
// address, a date, a number or a pick-list. The profile editor (frame 14, R14) shows one per
// model field, and the item page's [change] forms one per item field (R11).
import type { EditedField } from '../templates/model-edit-template.js';

/** What a box needs of its field: the key, the type, the saved value and a pick-list's choices. */
export type FieldBox = Pick<EditedField, 'key' | 'type' | 'value' | 'choices'>;

/** The box's id and field, and the name it is sent under if not the profile editor's. */
type FieldBoxProps = {
  readonly id: string;
  readonly field: FieldBox;
  readonly name?: string;
};

/** The name a field's box is sent under, as routes/api/model-profiles.ts reads it. */
export function fieldInputName(field: Pick<EditedField, 'key'>): string {
  return `field.${field.key}`;
}

/** A pick-list's choices, with "none" first to clear it, and a value no longer on the list. */
function PicklistInput(props: FieldBoxProps) {
  const { id, field } = props;
  const isOffList = field.value !== '' && !field.choices.includes(field.value);
  const choices = isOffList ? [...field.choices, field.value] : field.choices;
  return (
    <select id={id} name={props.name ?? fieldInputName(field)} class="field">
      <option value="">none</option>
      {choices.map((choice) => (
        <option key={choice} value={choice} selected={choice === field.value}>
          {choice}
        </option>
      ))}
    </select>
  );
}

/** A link's address, with a way to open it when it is a web address. */
function LinkInput(props: FieldBoxProps) {
  const { id, field } = props;
  // Only web addresses become links, so a stored value can never run script when clicked.
  const isWebLink = /^https?:\/\//i.test(field.value);
  return (
    <>
      <input
        id={id}
        type="url"
        name={props.name ?? fieldInputName(field)}
        class="field profile-edit__link"
        value={field.value}
      />
      {isWebLink && (
        <>
          {' '}
          <a href={field.value} class="caption">
            open »
          </a>
        </>
      )}
    </>
  );
}

/** The box for one field, by its type, holding its value as saved. */
export function ProfileFieldInput(props: FieldBoxProps) {
  const { id, field } = props;
  const name = props.name ?? fieldInputName(field);
  switch (field.type) {
    case 'longtext':
      return (
        <textarea id={id} name={name} class="field profile-edit__long" rows={4}>
          {field.value}
        </textarea>
      );
    case 'link':
      return <LinkInput {...props} />;
    case 'date':
      return <input id={id} type="date" name={name} class="field" value={field.value} />;
    case 'number':
      return (
        <input
          id={id}
          type="number"
          step="any"
          name={name}
          class="field profile-edit__number"
          value={field.value}
        />
      );
    case 'picklist':
      return <PicklistInput {...props} />;
    case 'text':
      return <input id={id} name={name} class="field profile-edit__short" value={field.value} />;
  }
}
