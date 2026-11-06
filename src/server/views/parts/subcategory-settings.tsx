// Settings' Subcategories panel (frame 15): each section's subcategories with the folders mapped
// to them and their item counts, edited in place (R5, R36), and a row to add one.
import { formatCount } from '../format.js';

import {
  ApiAction,
  ApiForm,
  EditButton,
  EditView,
  HiddenLabel,
  SaveOrCancel,
} from './inline-edit.js';
import { SettingsPanel } from './settings-panel.js';

import type { SectionSettings, SubcategorySetting } from '../../routes/pages/settings-model.js';

/** The folder a new mapping's field suggests, under the Reference folder. */
export type FolderHint = { readonly placeholder: string };

/** The name cell: the name, or the rename form in its place. */
function NameCell(props: { readonly row: SubcategorySetting }) {
  const { row } = props;
  const formId = `rename-${String(row.id)}`;
  return (
    <td>
      <EditView formId={formId}>{row.name}</EditView>
      <ApiForm action={`/api/subcategories/${String(row.id)}/name`} editId={formId}>
        <HiddenLabel for={`${formId}-name`}>New name for {row.name}</HiddenLabel>
        <input id={`${formId}-name`} name="name" class="field" value={row.name} required />{' '}
        <SaveOrCancel />
      </ApiForm>
    </td>
  );
}

/** The folders cell: each mapped folder with a way to unmap it, then the map-folder form. */
function FoldersCell(props: { readonly row: SubcategorySetting; readonly hint: FolderHint }) {
  const { row } = props;
  const formId = `map-${String(row.id)}`;
  return (
    <td>
      {row.folders.length === 0 && <span class="caption">none, filed by hand</span>}
      {row.folders.map((folder) => (
        <span key={folder.mappingId} class="settings-folder">
          <code>{folder.path}</code>{' '}
          <ApiAction
            action={`/api/folder-mappings/${String(folder.mappingId)}`}
            method="DELETE"
            label="unmap"
            name={`Unmap ${folder.path}`}
          />
        </span>
      ))}
      <ApiForm action={`/api/subcategories/${String(row.id)}/folders`} editId={formId}>
        <HiddenLabel for={`${formId}-folder`}>Folder to map to {row.name}</HiddenLabel>
        <input
          id={`${formId}-folder`}
          name="folder"
          class="field settings-table__path-field"
          placeholder={props.hint.placeholder}
          required
        />{' '}
        <SaveOrCancel saveLabel="Map" />
      </ApiForm>
    </td>
  );
}

/** One subcategory's row; the first of a section carries the section's name down the rows. */
function SubcategoryRow(props: {
  readonly row: SubcategorySetting;
  readonly section: SectionSettings;
  readonly isFirst: boolean;
  readonly hint: FolderHint;
}) {
  const { row, section } = props;
  const id = String(row.id);
  return (
    <tr>
      {props.isFirst && (
        <th scope="row" rowSpan={section.subcategories.length}>
          {section.label}
        </th>
      )}
      <NameCell row={row} />
      <FoldersCell row={row} hint={props.hint} />
      <td>{formatCount(row.itemCount)}</td>
      <td class="settings-table__actions">
        <EditButton formId={`rename-${id}`} label="rename" name={`Rename ${row.name}`} /> ·{' '}
        <EditButton formId={`map-${id}`} label="map folder" name={`Map a folder to ${row.name}`} />{' '}
        ·{' '}
        <ApiAction
          action={`/api/subcategories/${id}`}
          method="DELETE"
          label="remove"
          name={`Remove ${row.name}`}
        />
      </td>
    </tr>
  );
}

/** The last row: a section, a name and an optional folder for a new subcategory. */
function AddSubcategoryRow(props: {
  readonly sections: readonly SectionSettings[];
  readonly hint: FolderHint;
}) {
  return (
    <tr class="settings-table__add">
      <td colSpan={5}>
        <ApiForm action="/api/subcategories" label="Add a subcategory">
          <HiddenLabel for="new-subcategory-section">Section</HiddenLabel>
          <select id="new-subcategory-section" name="section" class="field">
            {props.sections.map((section) => (
              <option key={section.section} value={section.section}>
                {section.label}
              </option>
            ))}
          </select>{' '}
          <HiddenLabel for="new-subcategory-name">New subcategory name</HiddenLabel>
          <input
            id="new-subcategory-name"
            name="name"
            class="field"
            placeholder="new subcategory"
            required
          />{' '}
          <HiddenLabel for="new-subcategory-folder">Folder to map</HiddenLabel>
          <input
            id="new-subcategory-folder"
            name="folder"
            class="field settings-table__path-field"
            placeholder={props.hint.placeholder}
          />{' '}
          <button type="submit" class="button">
            Add subcategory
          </button>
        </ApiForm>
      </td>
    </tr>
  );
}

/** The Subcategories panel. */
export function SubcategorySettings(props: {
  readonly sections: readonly SectionSettings[];
  readonly hint: FolderHint;
}) {
  return (
    <SettingsPanel id="subcategories" title="Subcategories" note="each item has exactly one">
      <table class="settings-table">
        <thead>
          <tr>
            <th scope="col">Section</th>
            <th scope="col">Subcategory</th>
            <th scope="col">Folders mapped to it</th>
            <th scope="col">Items</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {props.sections.flatMap((section) =>
            section.subcategories.map((row, index) => (
              <SubcategoryRow
                key={row.id}
                row={row}
                section={section}
                isFirst={index === 0}
                hint={props.hint}
              />
            )),
          )}
          <AddSubcategoryRow sections={props.sections} hint={props.hint} />
        </tbody>
      </table>
      <p class="caption settings-panel__note">
        Removing a subcategory moves its items to Unsorted. Files on disk are never moved.
      </p>
    </SettingsPanel>
  );
}
