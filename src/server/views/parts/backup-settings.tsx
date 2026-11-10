// Settings' Backup and restore panel (R26): one link saves the library as a zip, and a zip chosen
// here replaces the library in place, with no dialog (R37). client/restore-backup.ts sends it.
import { SettingsPanel } from './settings-panel.js';

/** The Backup and restore panel. */
export function BackupSettings() {
  return (
    <SettingsPanel id="backup" title="Backup and restore" note="the library, as one zip">
      <p class="settings-backup__row">
        <a href="/settings/backup" class="button button--primary" download>
          Back up now
        </a>{' '}
        <span class="caption">
          Saves tags, collections, subcategories, fields, notes, model profiles and settings. The
          files in the archive stay where they are and aren't in the zip.
        </span>
      </p>
      <form
        class="inline-form settings-backup__row"
        aria-label="Restore a backup"
        data-restore-form
      >
        <label for="restore-file" class="caption">
          Restore from a backup
        </label>{' '}
        <input id="restore-file" name="backup" type="file" accept=".zip,application/zip" required />{' '}
        <button type="submit" class="button">
          Restore
        </button>
        <span class="inline-form__result" role="status" data-api-result hidden />
      </form>
      <p class="caption settings-panel__note">
        Restoring replaces the whole library with the backup's. The library as it is now is copied
        to the backups folder in the data folder first.
      </p>
    </SettingsPanel>
  );
}
