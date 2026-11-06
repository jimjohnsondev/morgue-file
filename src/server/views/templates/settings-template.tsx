// The Settings page (frame 15): a side list of its sections beside the Fields, Subcategories and
// Watched folders panels, each edited in a table in place (R36, R37). Editing fields arrives
// with PR 17, so the Fields tables are drawn as the frame shows them with their actions disabled.
import { Breadcrumb } from '../parts/breadcrumb.js';
import { HiddenLabel } from '../parts/inline-edit.js';
import { PendingAction } from '../parts/pending-action.js';
import { SettingsPanel } from '../parts/settings-panel.js';
import { SubcategorySettings } from '../parts/subcategory-settings.js';
import { WatchedFolderSettings } from '../parts/watched-folder-settings.js';

import type { FieldSetting, SettingsModel } from '../../routes/pages/settings-model.js';
import type { FolderHint } from '../parts/subcategory-settings.js';

/** The types a new field can have, as the Add field row lists them. */
const NEW_FIELD_TYPES = ['short text', 'long text', 'link', 'date', 'number', 'pick-list'];

/** One field's row: its name, type, order arrows and actions. */
function FieldSettingRow(props: { readonly field: FieldSetting }) {
  const { field } = props;
  return (
    <tr>
      <th scope="row">{field.label}</th>
      <td>
        {field.typeName}
        {field.isPicklist && (
          <>
            {' '}
            <PendingAction label="edit choices" />
          </>
        )}
      </td>
      <td class="settings-table__actions">
        <PendingAction label="▲" name={`Move ${field.label} up`} />{' '}
        <PendingAction label="▼" name={`Move ${field.label} down`} />
      </td>
      <td class="settings-table__actions">
        {field.isRequired ? (
          <span class="caption">required</span>
        ) : (
          <>
            <PendingAction label="rename" name={`Rename ${field.label}`} /> ·{' '}
            <PendingAction label="remove" name={`Remove ${field.label}`} />
          </>
        )}
      </td>
    </tr>
  );
}

/** One fields table, items' or models', ending in the row that adds a field. */
function FieldTable(props: {
  readonly id: string;
  readonly title: string;
  readonly note?: string;
  readonly fields: readonly FieldSetting[];
}) {
  return (
    <div class="settings-fields__table">
      <h3 class="settings-heading">
        {props.title} {props.note !== undefined && <span class="caption">· {props.note}</span>}
      </h3>
      <table class="settings-table">
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Type</th>
            <th scope="col">Order</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {props.fields.map((field) => (
            <FieldSettingRow key={field.key} field={field} />
          ))}
          <tr class="settings-table__add">
            <td>
              <HiddenLabel for={`${props.id}-name`}>New field name</HiddenLabel>
              <input id={`${props.id}-name`} class="field" placeholder="new field name" disabled />
            </td>
            <td>
              <HiddenLabel for={`${props.id}-type`}>Type</HiddenLabel>
              <select id={`${props.id}-type`} class="field" disabled>
                {NEW_FIELD_TYPES.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </td>
            <td />
            <td>
              <button type="button" class="button" disabled>
                Add field
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** The Fields panel: the fields on items beside the fields on models. */
function FieldSettings(props: { readonly model: SettingsModel }) {
  return (
    <SettingsPanel id="fields" title="Fields" note="changes apply to every page at once">
      <div class="settings-fields">
        <FieldTable
          id="new-item-field"
          title="On items"
          note="photos, videos and Library items"
          fields={props.model.itemFields}
        />
        <FieldTable id="new-model-field" title="On models" fields={props.model.modelFields} />
      </div>
      <p class="caption settings-panel__note">
        Removing a field hides it everywhere and keeps its values for 30 days, so it can be
        restored.
      </p>
    </SettingsPanel>
  );
}

/** The side list of the page's panels. Backup and restore arrives with PR 24. */
function SectionList() {
  return (
    <nav aria-label="Settings sections" class="panel settings-sections">
      <h2 class="panel__title">Sections</h2>
      <a href="#fields">Fields</a>
      <a href="#subcategories">Subcategories</a>
      <a href="#folders">Watched folders</a>
      <span>
        <PendingAction label="Backup and restore" />
      </span>
    </nav>
  );
}

/** The Settings page: the side list of panels, then the three panels. */
export function SettingsTemplate(props: {
  readonly model: SettingsModel;
  readonly folderHint: FolderHint;
}) {
  const { model } = props;
  return (
    <div class="settings-page">
      <Breadcrumb crumbs={[{ label: 'Home', href: '/' }, { label: 'Settings' }]} />
      <h1 class="page__title">Settings</h1>
      <div class="settings-page__body">
        <SectionList />
        <div class="settings-page__panels">
          <FieldSettings model={model} />
          <SubcategorySettings sections={model.sections} hint={props.folderHint} />
          <WatchedFolderSettings folders={model.folders} />
        </div>
      </div>
    </div>
  );
}
