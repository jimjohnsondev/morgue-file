// The Settings page (frame 15): a side list of its sections beside the Fields, Subcategories and
// Watched folders panels, each edited in a table in place (R36, R37).
import { Breadcrumb } from '../parts/breadcrumb.js';
import { FieldSettings } from '../parts/field-settings.js';
import { PendingAction } from '../parts/pending-action.js';
import { SubcategorySettings } from '../parts/subcategory-settings.js';
import { WatchedFolderSettings } from '../parts/watched-folder-settings.js';

import type { SettingsModel } from '../../routes/pages/settings-model.js';
import type { FolderHint } from '../parts/subcategory-settings.js';

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
          <FieldSettings itemFields={model.itemFields} modelFields={model.modelFields} />
          <SubcategorySettings sections={model.sections} hint={props.folderHint} />
          <WatchedFolderSettings folders={model.folders} />
        </div>
      </div>
    </div>
  );
}
