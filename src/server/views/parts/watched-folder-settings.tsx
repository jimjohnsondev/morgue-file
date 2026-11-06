// Settings' Watched folders panel (frame 15): the Reference folder, its Inbox and any other
// watched folders, with their status and counts; rescan, change location, and add a folder (R1).
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

import type { WatchedFolderSetting } from '../../routes/pages/settings-model.js';

/** The status cell: online, watching for changes; or offline. */
function StatusCell(props: { readonly row: WatchedFolderSetting }) {
  const { row } = props;
  if (row.status === 'offline') {
    return (
      <td>
        <span class="status-badge status-badge--offline">offline</span>
      </td>
    );
  }
  return (
    <td>
      <span class="status-badge">online</span>
      {!row.isInbox && <span class="caption"> watching for changes</span>}
    </td>
  );
}

/** The folder cell: its path, or the change-location form in its place. */
function FolderCell(props: { readonly row: WatchedFolderSetting; readonly formId: string }) {
  const { row, formId } = props;
  return (
    <th scope="row">
      <EditView formId={formId}>
        <code>{row.path}</code>
      </EditView>
      {!row.isInbox && (
        <ApiForm action={`/api/roots/${String(row.rootId)}/location`} editId={formId}>
          <HiddenLabel for={`${formId}-folder`}>New location of {row.path}</HiddenLabel>
          <input
            id={`${formId}-folder`}
            name="folder"
            class="field settings-table__path-field"
            value={row.path}
            required
          />{' '}
          <SaveOrCancel />
        </ApiForm>
      )}
    </th>
  );
}

/** One watched folder. The Inbox moves with its Reference folder, so it changes there. */
function WatchedFolderRow(props: { readonly row: WatchedFolderSetting }) {
  const { row } = props;
  const formId = `location-${String(row.rootId)}`;
  return (
    <tr>
      <FolderCell row={row} formId={formId} />
      <td>{row.role}</td>
      <StatusCell row={row} />
      <td>{formatCount(row.itemCount)}</td>
      <td class="settings-table__actions">
        {row.isInbox ? (
          <span class="caption">moves with the Reference folder</span>
        ) : (
          <>
            <ApiAction
              action={`/api/roots/${String(row.rootId)}/rescan`}
              label="rescan"
              name={`Rescan ${row.path}`}
            />{' '}
            ·{' '}
            <EditButton
              formId={formId}
              label="change location"
              name={`Change location of ${row.path}`}
            />
          </>
        )}
      </td>
    </tr>
  );
}

/** The Watched folders panel. */
export function WatchedFolderSettings(props: {
  readonly folders: readonly WatchedFolderSetting[];
}) {
  return (
    <SettingsPanel id="folders" title="Watched folders" note="indexed in place, never changed">
      <table class="settings-table">
        <thead>
          <tr>
            <th scope="col">Folder</th>
            <th scope="col">Role</th>
            <th scope="col">Status</th>
            <th scope="col">Items</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {props.folders.map((row) => (
            <WatchedFolderRow key={`${String(row.rootId)}-${row.role}`} row={row} />
          ))}
          <tr class="settings-table__add">
            <td colSpan={5}>
              <ApiForm action="/api/roots" label="Add a watched folder">
                <label for="new-watched-folder" class="caption">
                  Add a folder
                </label>{' '}
                <input
                  id="new-watched-folder"
                  name="folder"
                  class="field settings-table__path-field"
                  placeholder="D:\Phone exports"
                  required
                />{' '}
                <button type="submit" class="button">
                  Add and index
                </button>
              </ApiForm>
            </td>
          </tr>
        </tbody>
      </table>
    </SettingsPanel>
  );
}
