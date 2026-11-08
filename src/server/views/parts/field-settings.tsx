// Settings' Fields panel (frame 15): the fields on items beside the fields on models, each
// renamed, reordered, given choices or removed in place, a row to add one, and the removed
// fields that can still be restored with their values (R14, R36, R38).
import { formatDay } from '../format.js';

import {
  ApiAction,
  ApiForm,
  EditButton,
  EditView,
  HiddenLabel,
  SaveOrCancel,
} from './inline-edit.js';
import { SettingsPanel } from './settings-panel.js';

import type { FieldEntity, FieldType } from '#core/db/repositories/fields.js';
import type {
  FieldSetting,
  FieldTableSettings,
  RemovedFieldSetting,
} from '../../routes/pages/settings-model.js';

/** The types a new field can have, as the Add field row lists them. */
const NEW_FIELD_TYPES: readonly { readonly type: FieldType; readonly name: string }[] = [
  { type: 'text', name: 'short text' },
  { type: 'longtext', name: 'long text' },
  { type: 'link', name: 'link' },
  { type: 'date', name: 'date' },
  { type: 'number', name: 'number' },
  { type: 'picklist', name: 'pick-list' },
];

/** The address of one field's changes. */
function fieldAction(field: { readonly id: number }, change = ''): string {
  return `/api/fields/${String(field.id)}${change}`;
}

/** The name cell: the name, or the rename form in its place. */
function NameCell(props: { readonly field: FieldSetting }) {
  const { field } = props;
  const formId = `rename-field-${String(field.id)}`;
  if (field.isRequired) {
    return <th scope="row">{field.label}</th>;
  }
  return (
    <th scope="row">
      <EditView formId={formId}>{field.label}</EditView>
      <ApiForm action={fieldAction(field, '/label')} editId={formId}>
        <HiddenLabel for={`${formId}-label`}>New name for {field.label}</HiddenLabel>
        <input
          id={`${formId}-label`}
          name="label"
          class="field"
          value={field.label}
          required
        />{' '}
        <SaveOrCancel />
      </ApiForm>
    </th>
  );
}

/** The type cell; a pick-list's choices open in a form in place to be edited. */
function TypeCell(props: { readonly field: FieldSetting }) {
  const { field } = props;
  const formId = `choices-${String(field.id)}`;
  if (!field.isPicklist) {
    return <td>{field.typeName}</td>;
  }
  return (
    <td>
      <EditView formId={formId}>
        {field.typeName}{' '}
        <EditButton
          formId={formId}
          label="edit choices"
          name={`Edit the choices of ${field.label}`}
        />
      </EditView>
      <ApiForm action={fieldAction(field, '/choices')} editId={formId}>
        <HiddenLabel for={`${formId}-choices`}>
          Choices of {field.label}, separated by commas (a choice can't hold one)
        </HiddenLabel>
        <input
          id={`${formId}-choices`}
          name="choices"
          class="field"
          value={field.choices.join(', ')}
          placeholder="Short, Long, Both"
        />{' '}
        <SaveOrCancel />
      </ApiForm>
    </td>
  );
}

/** The order cell: arrows that move the field up or down, or plain ones where it can't go. */
function OrderCell(props: { readonly field: FieldSetting }) {
  const { field } = props;
  if (field.isRequired) {
    return <td class="settings-table__actions">▲ ▼</td>;
  }
  return (
    <td class="settings-table__actions">
      {field.canMoveUp ? (
        <ApiAction action={fieldAction(field, '/up')} label="▲" name={`Move ${field.label} up`} />
      ) : (
        '▲'
      )}{' '}
      {field.canMoveDown ? (
        <ApiAction
          action={fieldAction(field, '/down')}
          label="▼"
          name={`Move ${field.label} down`}
        />
      ) : (
        '▼'
      )}
    </td>
  );
}

/** One field's row: its name, type, order arrows and actions. */
function FieldSettingRow(props: { readonly field: FieldSetting }) {
  const { field } = props;
  return (
    <tr>
      <NameCell field={field} />
      <TypeCell field={field} />
      <OrderCell field={field} />
      <td class="settings-table__actions">
        {field.isRequired ? (
          <span class="caption">required</span>
        ) : (
          <>
            <EditButton
              formId={`rename-field-${String(field.id)}`}
              label="rename"
              name={`Rename ${field.label}`}
            />{' '}
            ·{' '}
            <ApiAction
              action={fieldAction(field)}
              method="DELETE"
              label="remove"
              name={`Remove ${field.label}`}
            />
          </>
        )}
      </td>
    </tr>
  );
}

/** The last row: a name and a type for a new field, sent by the form in its last cell. */
function AddFieldRow(props: { readonly entity: FieldEntity }) {
  const formId = `new-${props.entity}-field`;
  return (
    <tr class="settings-table__add">
      <td>
        <HiddenLabel for={`${formId}-name`}>New {props.entity} field name</HiddenLabel>
        <input
          id={`${formId}-name`}
          form={formId}
          name="label"
          class="field"
          placeholder="new field name"
          required
        />
      </td>
      <td>
        <HiddenLabel for={`${formId}-type`}>Type</HiddenLabel>
        <select id={`${formId}-type`} form={formId} name="type" class="field">
          {NEW_FIELD_TYPES.map((choice) => (
            <option key={choice.type} value={choice.type}>
              {choice.name}
            </option>
          ))}
        </select>
      </td>
      <td />
      <td>
        <ApiForm action="/api/fields" id={formId} label={`Add a field to every ${props.entity}`}>
          <input type="hidden" name="entity" value={props.entity} />
          <button type="submit" class="button">
            Add field
          </button>
        </ApiForm>
      </td>
    </tr>
  );
}

/** The removed fields that can still be restored, each with the day it can be until. */
function RemovedFields(props: { readonly removed: readonly RemovedFieldSetting[] }) {
  return (
    <ul class="caption settings-removed" aria-label="Removed fields">
      {props.removed.map((field) => (
        <li key={field.id}>
          Removed: {field.label}, restorable until {formatDay(field.restoreUntil)}{' '}
          <ApiAction
            action={fieldAction(field, '/restore')}
            label="restore"
            name={`Restore ${field.label}`}
          />
        </li>
      ))}
    </ul>
  );
}

/** One fields table, items' or models', ending in the row that adds a field. */
function FieldTable(props: {
  readonly entity: FieldEntity;
  readonly title: string;
  readonly note?: string;
  readonly table: FieldTableSettings;
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
          {props.table.fields.map((field) => (
            <FieldSettingRow key={field.id} field={field} />
          ))}
          <AddFieldRow entity={props.entity} />
        </tbody>
      </table>
      {props.table.removed.length > 0 && <RemovedFields removed={props.table.removed} />}
    </div>
  );
}

/** The Fields panel: the fields on items beside the fields on models. */
export function FieldSettings(props: {
  readonly itemFields: FieldTableSettings;
  readonly modelFields: FieldTableSettings;
}) {
  return (
    <SettingsPanel id="fields" title="Fields" note="changes apply to every page at once">
      <div class="settings-fields">
        <FieldTable
          entity="item"
          title="On items"
          note="photos, videos and Library items"
          table={props.itemFields}
        />
        <FieldTable entity="model" title="On models" table={props.modelFields} />
      </div>
      <p class="caption settings-panel__note">
        Removing a field hides it everywhere and keeps its values for 30 days, so it can be
        restored.
      </p>
    </SettingsPanel>
  );
}
