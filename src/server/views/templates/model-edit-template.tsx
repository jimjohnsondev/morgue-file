// The profile editor (frame 14): the Model profile in edit mode, with one row per field drawn by
// its type, the model tags as chips, and a portrait chooser from the model's photos. It is one
// form on the page, saved with Save profile or Ctrl+S; nothing opens a dialog (R14, R37).
import { Breadcrumb } from '../parts/breadcrumb.js';
import { ApiForm } from '../parts/inline-edit.js';
import { ModelTagEditor } from '../parts/model-tag-editor.js';
import { PortraitChooser } from '../parts/portrait-chooser.js';
import { ProfileFieldInput } from '../parts/profile-field-input.js';

import type { FieldType } from '#core/db/repositories/fields.js';
import type { Crumb } from '../parts/breadcrumb.js';
import type { StripLink } from '../parts/preview-strip.js';

/** One field's row: its name, its value as its box holds it, and its type. */
export type EditedField = {
  readonly key: string;
  readonly label: string;
  readonly type: FieldType;
  /** "short text", "pick-list"…, as Settings names the type. */
  readonly typeName: string;
  /** The saved value as text, empty when there is none. */
  readonly value: string;
  /** A pick-list's choices; empty for other types. */
  readonly choices: readonly string[];
};

/** A photo the portrait can be chosen from. */
export type PortraitChoice = {
  readonly itemId: number;
  readonly imageSrc: string;
  readonly fileName: string;
  readonly isChosen: boolean;
};

/** Everything the profile editor shows. */
export type ModelEditModel = {
  readonly modelId: number;
  readonly name: string;
  readonly firstName: string;
  readonly profileHref: string;
  readonly breadcrumb: readonly Crumb[];
  readonly fields: readonly EditedField[];
  readonly tags: readonly string[];
  readonly portraitChoices: readonly PortraitChoice[];
  /** "more of Elena's 212 photos »", when the chooser doesn't show them all. */
  readonly morePhotos: StripLink | undefined;
};

/** The fields table: a row per field, then the model tags. */
function FieldsTable(props: { readonly model: ModelEditModel }) {
  const { model } = props;
  return (
    <table class="details-table profile-edit__fields">
      <tbody>
        {model.fields.map((field) => (
          <tr key={field.key}>
            <th scope="row">
              <label for={`field-${field.key}`}>{field.label}</label>
            </th>
            <td>
              <ProfileFieldInput id={`field-${field.key}`} field={field} />
            </td>
            <td class="profile-edit__type">{field.typeName}</td>
          </tr>
        ))}
        <tr id="model-tags">
          <th scope="row">Model tags</th>
          <td>
            <ModelTagEditor tags={model.tags} />
          </td>
          <td class="profile-edit__type">model tags</td>
        </tr>
      </tbody>
    </table>
  );
}

/** Save and Cancel at the foot of the form, and the key that saves. */
function FormActions(props: { readonly profileHref: string }) {
  return (
    <div class="profile-edit__actions">
      <button type="submit" class="button button--primary button--large">
        Save profile
      </button>
      <a class="button" href={props.profileHref}>
        Cancel
      </a>
      <span class="caption profile-edit__key">Ctrl+S saves</span>
    </div>
  );
}

/** The whole profile editor body; the layout adds the banner, tabs and footer. */
export function ModelEditTemplate(props: { readonly model: ModelEditModel }) {
  const { model } = props;
  return (
    <div class="index-page">
      <Breadcrumb crumbs={model.breadcrumb} />
      <div class="index-page__heading">
        <h1 class="page__title">Edit {model.name}</h1>
        <span class="caption">changes are saved to the archive database, never to your files</span>
      </div>
      <section aria-label="Editing profile" class="panel profile-edit">
        <h2 class="panel__title panel__title--edit panel__title--split">
          <span>Editing profile</span>
          <a href={model.profileHref}>cancel</a>
        </h2>
        <div class="panel__body">
          <ApiForm
            action={`/api/models/${String(model.modelId)}/profile`}
            next={model.profileHref}
            label={`Edit ${model.name}`}
            isPageForm
          >
            <div class="profile-edit__body">
              <FieldsTable model={model} />
              <span class="caption">
                Fields are the same for every model.{' '}
                <a href="/settings#fields">Add, rename or remove fields in Settings »</a>
              </span>
              <PortraitChooser
                firstName={model.firstName}
                choices={model.portraitChoices}
                more={model.morePhotos}
              />
              <FormActions profileHref={model.profileHref} />
            </div>
          </ApiForm>
        </div>
      </section>
    </div>
  );
}
