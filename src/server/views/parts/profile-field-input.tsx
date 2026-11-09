// A model field's box on the profile editor (frame 14), drawn by the field's type: a line for
// short text, a box for long text, an address, a date, a number or a pick-list (R14).
import type { EditedField } from '../templates/model-edit-template.js';

/** The name a field's box is sent under, as routes/api/model-profiles.ts reads it. */
export function fieldInputName(field: Pick<EditedField, 'key'>): string {
  return `field.${field.key}`;
}

/** A pick-list's choices, with "none" first to clear it, and a value no longer on the list. */
function PicklistInput(props: { readonly id: string; readonly field: EditedField }) {
  const { id, field } = props;
  const isOffList = field.value !== '' && !field.choices.includes(field.value);
  const choices = isOffList ? [...field.choices, field.value] : field.choices;
  return (
    <select id={id} name={fieldInputName(field)} class="field">
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
function LinkInput(props: { readonly id: string; readonly field: EditedField }) {
  const { id, field } = props;
  // Only web addresses become links, so a stored value can never run script when clicked.
  const isWebLink = /^https?:\/\//i.test(field.value);
  return (
    <>
      <input
        id={id}
        type="url"
        name={fieldInputName(field)}
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
export function ProfileFieldInput(props: { readonly id: string; readonly field: EditedField }) {
  const { id, field } = props;
  const name = fieldInputName(field);
  switch (field.type) {
    case 'longtext':
      return (
        <textarea id={id} name={name} class="field profile-edit__long" rows={4}>
          {field.value}
        </textarea>
      );
    case 'link':
      return <LinkInput id={id} field={field} />;
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
      return <PicklistInput id={id} field={field} />;
    case 'text':
      return <input id={id} name={name} class="field profile-edit__short" value={field.value} />;
  }
}
