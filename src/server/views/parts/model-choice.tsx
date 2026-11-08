// The model a link is for (R15): a select list of the models, ending in "New model…", and the
// name field for a new one. client/model-choice.ts shows the name field only while "New model…"
// is chosen; with no models yet it is the only choice, so the field shows from the start.
import { HiddenLabel } from './inline-edit.js';

/** A model in the list: its id, sent as text, and its name. */
export type ModelOption = {
  readonly value: string;
  readonly label: string;
};

/** The select list and the new model's name field, inside a form that sends them. */
export function ModelChoiceFields(props: {
  /** The select list's id; the name field's id adds `-name`. */
  readonly id: string;
  readonly models: readonly ModelOption[];
}) {
  const { id, models } = props;
  return (
    <>
      <select id={id} name="model" class="field" data-model-choice>
        {models.map((model) => (
          <option key={model.value} value={model.value}>
            {model.label}
          </option>
        ))}
        <option value="new">New model…</option>
      </select>
      <HiddenLabel for={`${id}-name`}>New model's name</HiddenLabel>
      <input
        id={`${id}-name`}
        name="name"
        class="field model-choice__name"
        placeholder="new model's name"
        hidden={models.length > 0}
        data-new-model-name
      />
    </>
  );
}
