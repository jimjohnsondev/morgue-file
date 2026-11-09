// Builds the Settings page (frame 15): the fields on items and models, the subcategories of each
// section with their mapped folders, and the watched folders (R36).
import { INBOX_FOLDER_NAME } from '#core/archive/originals.js';
import {
  countKeptItems,
  countKeptItemsUnder,
  findAllRoots,
  REFERENCE_ROOT_ID,
} from '#core/db/repositories/roots.js';
import {
  countItemsBySubcategory,
  findAllSubcategories,
  findFolderMappings,
} from '#core/db/repositories/subcategories.js';
import { isModelName, listRestorableFields, listSettingsFields } from '#core/fields/fields.js';
import { showRootFolder } from '#core/filing/folder-paths.js';

import { SECTION_LABELS } from './filter-choices.js';

import type { Db } from '#core/db/connection.js';
import type { Field, FieldEntity } from '#core/db/repositories/fields.js';
import type { Section } from '#core/db/repositories/items.js';
import type { Root, RootStatus } from '#core/db/repositories/roots.js';
import type { FolderMapping } from '#core/db/repositories/subcategories.js';

/** How the fields tables name each type; a rating's range is part of its name in Settings. */
export const TYPE_NAMES: Readonly<Record<Field['type'], string>> = {
  text: 'short text',
  longtext: 'long text',
  link: 'link',
  date: 'date',
  number: 'number',
  picklist: 'pick-list',
};

/** One row of a fields table. */
export type FieldSetting = {
  readonly id: number;
  readonly key: string;
  readonly label: string;
  /** "long text", "number, 1 to 5", "pick-list: Short, Long, Both". */
  readonly typeName: string;
  /** A pick-list's choices, for its edit-choices form; empty for other types. */
  readonly choices: readonly string[];
  readonly isPicklist: boolean;
  /** A model's Name: it stays first and can't be removed. */
  readonly isRequired: boolean;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
};

/** A removed field that can still be restored with its values (R38). */
export type RemovedFieldSetting = {
  readonly id: number;
  readonly label: string;
  /** The last moment it can be restored, as an ISO time. */
  readonly restoreUntil: string;
};

/** One fields table: its rows, then the removed fields that can be restored. */
export type FieldTableSettings = {
  readonly fields: readonly FieldSetting[];
  readonly removed: readonly RemovedFieldSetting[];
};

/** A folder mapped to a subcategory, by its full path. */
export type MappedFolder = {
  readonly mappingId: number;
  readonly path: string;
};

/** One row of the subcategories table. */
export type SubcategorySetting = {
  readonly id: number;
  readonly name: string;
  readonly folders: readonly MappedFolder[];
  readonly itemCount: number;
};

/** A section's rows of the subcategories table. */
export type SectionSettings = {
  readonly section: Section;
  readonly label: string;
  readonly subcategories: readonly SubcategorySetting[];
};

/** One row of the watched folders table: a root, or the Reference folder's Inbox. */
export type WatchedFolderSetting = {
  /** The root's id; the Inbox row has its Reference folder's. */
  readonly rootId: number;
  readonly path: string;
  readonly role: string;
  readonly status: RootStatus;
  readonly itemCount: number;
  /** The Inbox lives inside the Reference folder, so it is moved and scanned with it. */
  readonly isInbox: boolean;
};

/** Everything the Settings page shows. */
export type SettingsModel = {
  readonly itemFields: FieldTableSettings;
  readonly modelFields: FieldTableSettings;
  readonly sections: readonly SectionSettings[];
  readonly folders: readonly WatchedFolderSetting[];
};

/** Names a field's type as the fields table reads it. */
function typeNameOf(field: Field): string {
  if (field.type === 'picklist') {
    return field.options.length === 0
      ? 'pick-list, no choices yet'
      : `pick-list: ${field.options.join(', ')}`;
  }
  // The rating is the one number with a fixed range (1 to 5, R11).
  return field.key === 'rating' ? 'number, 1 to 5' : TYPE_NAMES[field.type];
}

/**
 * An entity's fields table: the fields it shows on every page (not those limited to one
 * subcategory), then the removed ones that can still be restored.
 */
function fieldTableSettings(db: Db, entity: FieldEntity, now: Date): FieldTableSettings {
  const fields = listSettingsFields(db, entity);
  const firstMovable = fields.findIndex((field) => !isModelName(field));
  return {
    fields: fields.map((field, index) => ({
      id: field.id,
      key: field.key,
      label: field.label,
      typeName: typeNameOf(field),
      choices: field.options,
      isPicklist: field.type === 'picklist',
      isRequired: isModelName(field),
      canMoveUp: !isModelName(field) && index > firstMovable,
      canMoveDown: !isModelName(field) && index < fields.length - 1,
    })),
    removed: listRestorableFields(db, entity, now).map(({ field, restoreUntil }) => ({
      id: field.id,
      label: field.label,
      restoreUntil: restoreUntil.toISOString(),
    })),
  };
}

/** The folders mapped to one subcategory, by their full paths. */
function mappedFolders(
  subcategoryId: number,
  mappings: readonly FolderMapping[],
  rootsById: ReadonlyMap<number, Root>,
): MappedFolder[] {
  return mappings.flatMap((mapping) => {
    const root = rootsById.get(mapping.rootId);
    return mapping.subcategoryId === subcategoryId && root !== undefined
      ? [{ mappingId: mapping.id, path: showRootFolder(root, mapping.relPrefix) }]
      : [];
  });
}

/** The subcategories table, one group of rows per section. */
function sectionSettings(db: Db, roots: readonly Root[]): SectionSettings[] {
  const counts = countItemsBySubcategory(db);
  const rootsById = new Map(roots.map((root) => [root.id, root]));
  const mappings = findFolderMappings(db);
  const subcategories = findAllSubcategories(db);
  return Object.entries(SECTION_LABELS).map(([section, label]) => ({
    section: section as Section,
    label,
    subcategories: subcategories
      .filter((entry) => entry.section === section)
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        folders: mappedFolders(entry.id, mappings, rootsById),
        itemCount: counts.get(entry.id) ?? 0,
      })),
  }));
}

/** The watched folders table: each root, with the Reference folder's Inbox under it. */
function folderSettings(db: Db, roots: readonly Root[]): WatchedFolderSetting[] {
  return roots.flatMap((root) => {
    const row = {
      rootId: root.id,
      path: root.path,
      role: root.id === REFERENCE_ROOT_ID ? 'Reference folder' : 'Watched folder',
      status: root.status,
      itemCount: countKeptItems(db, root.id),
      isInbox: false,
    };
    if (root.id !== REFERENCE_ROOT_ID) {
      return [row];
    }
    const inbox = {
      ...row,
      path: showRootFolder(root, INBOX_FOLDER_NAME),
      role: 'Inbox for drops and pastes',
      itemCount: countKeptItemsUnder(db, root.id, INBOX_FOLDER_NAME),
      isInbox: true,
    };
    return [row, inbox];
  });
}

/** Builds the Settings page from the library, as it stands at this time. */
export function buildSettingsModel(db: Db, now: Date): SettingsModel {
  const roots = findAllRoots(db);
  return {
    itemFields: fieldTableSettings(db, 'item', now),
    modelFields: fieldTableSettings(db, 'model', now),
    sections: sectionSettings(db, roots),
    folders: folderSettings(db, roots),
  };
}
