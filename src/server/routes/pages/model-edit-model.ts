// Reads a model's profile from the library and lays it out for its edit page (frame 14): one row
// per field, by type, the model tags, and the model's photos to choose the portrait from (R14).
import { countItemsBySectionByQuery, findItemsByQuery } from '#core/db/repositories/item-lists.js';
import { findItemById } from '#core/db/repositories/items.js';
import { findModelTagNames } from '#core/db/repositories/models.js';
import { readFieldValues } from '#core/fields/fields.js';
import { compileQuery } from '#core/query/compile-query.js';

import { FIELD_TYPE_NAMES, formatCount } from '../../views/format.js';

import { searchHref } from './active-filters.js';
import { readModelName, sectionQuery } from './model-profile-model.js';
import { thumbnailSrc } from './thumb-cards.js';

import type { Db } from '#core/db/connection.js';
import type { Item } from '#core/db/repositories/items.js';
import type { ModelRow } from '#core/db/repositories/models.js';
import type { FieldWithValue } from '#core/fields/fields.js';
import type {
  EditedField,
  ModelEditModel,
  PortraitChoice,
} from '../../views/templates/model-edit-template.js';

/** How many of the model's photos the portrait chooser shows, as frame 14 does. */
export const PORTRAIT_CHOICES = 8;

/** A field's row: its value as its box holds it (a date as YYYY-MM-DD, a number as digits). */
function toEditedField(entry: FieldWithValue): EditedField {
  const { field, value } = entry;
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    typeName: FIELD_TYPE_NAMES[field.type],
    value: value === undefined ? '' : String(value),
    choices: field.options,
  };
}

/** A photo in the chooser: its small thumbnail and file name. */
function toPortraitChoice(
  item: Pick<Item, 'id' | 'kind' | 'mtimeMs' | 'relPath'>,
  chosen: boolean,
) {
  return {
    itemId: item.id,
    imageSrc: thumbnailSrc(item, 'small'),
    fileName: item.relPath.split('/').at(-1) ?? item.relPath,
    isChosen: chosen,
  };
}

/**
 * The model's first photos in list order, with the current portrait first when it isn't among
 * them (it can be any photo in the archive), so the chosen one is always on show.
 */
function portraitChoices(db: Db, model: ModelRow, name: string): PortraitChoice[] {
  const photos = findItemsByQuery(db, compileQuery(sectionQuery('photos', name)), {
    limit: PORTRAIT_CHOICES,
    offset: 0,
  });
  const portraitId = model.portraitItemId;
  const choices = photos.map((photo) => toPortraitChoice(photo, photo.id === portraitId));
  const portrait = portraitId === undefined ? undefined : findItemById(db, portraitId);
  if (portrait === undefined || choices.some((choice) => choice.isChosen)) {
    return choices;
  }
  return [toPortraitChoice(portrait, true), ...choices].slice(0, PORTRAIT_CHOICES);
}

/** Builds the edit page of a model's profile. */
export function buildModelEditModel(db: Db, model: ModelRow): ModelEditModel {
  const fields = readFieldValues(db, { entity: 'model', entityId: model.id });
  const name = readModelName(fields, model);
  // Frame 14 calls the model by first name: "pick any photo of Elena".
  const firstName = name.split(/\s+/)[0] ?? name;
  const profileHref = `/models/${model.slug}`;
  const photosQuery = sectionQuery('photos', name);
  const photoCount = countItemsBySectionByQuery(db, compileQuery(photosQuery)).get('photos') ?? 0;
  return {
    modelId: model.id,
    name,
    firstName,
    profileHref,
    breadcrumb: [
      { label: 'Home', href: '/' },
      { label: 'Models', href: '/models' },
      { label: name, href: profileHref },
      { label: 'Edit' },
    ],
    fields: fields.map(toEditedField),
    tags: findModelTagNames(db, model.id),
    portraitChoices: portraitChoices(db, model, name),
    morePhotos:
      photoCount > PORTRAIT_CHOICES
        ? {
            text: `more of ${firstName}'s ${formatCount(photoCount)} photos »`,
            href: searchHref(photosQuery),
          }
        : undefined,
  };
}
