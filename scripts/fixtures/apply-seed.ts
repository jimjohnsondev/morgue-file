// Applies fixtures/seed.json to a library whose items are already indexed, through the app's own
// repositories and field system, so seeding exercises the same code the app runs.
import { addItemsToCollection, insertCollection } from '#core/db/repositories/collections.js';
import { findFieldByKey } from '#core/db/repositories/fields.js';
import { recordItemView } from '#core/db/repositories/item-views.js';
import {
  fileItemsByHand,
  findItemById,
  findItemIdsByPath,
  refileItemsByMappings,
} from '#core/db/repositories/items.js';
import { linkModelToItems, setModelPortrait, tagModel } from '#core/db/repositories/models.js';
import {
  findSubcategoryBySlug,
  insertFolderMapping,
  insertSubcategory,
} from '#core/db/repositories/subcategories.js';
import { tagItems } from '#core/db/repositories/tags.js';
import { addField, setFieldValue, setPicklistChoices } from '#core/fields/fields.js';
import { createModel } from '#core/models/models.js';
import { slugify } from '#core/slug.js';

import { matchItems } from './seed.ts';

import type { Db } from '#core/db/connection.js';
import type { Seed } from './seed.ts';

/** The library being seeded: the root its items sit under, and the time stamped on new rows. */
type SeedTarget = {
  readonly db: Db;
  readonly rootId: number;
  readonly now: string;
  /** Item ids by path under the root. */
  readonly itemIds: ReadonlyMap<string, number>;
};

/** Applies the whole seed in one transaction, so a bad entry leaves the library as it was. */
export function applySeed(
  db: Db,
  seed: Seed,
  options: { readonly rootId: number; readonly now: string },
): void {
  db.transaction(() => {
    const target = { db, ...options, itemIds: findItemIdsByPath(db, options.rootId) };
    applySubcategories(target, seed);
    applyItemFields(target, seed);
    applyModels(target, seed);
    applyTagsAndCollections(target, seed);
    for (const view of seed.views) {
      recordItemView(db, { itemId: idFor(target, view.item), ...viewDetails(view) });
    }
  })();
}

/** The ids of the items the patterns name, in path order. */
function idsFor(target: SeedTarget, patterns: readonly string[]): number[] {
  const matched = new Set(matchItems(patterns, [...target.itemIds.keys()]));
  if (matched.size === 0) {
    throw new Error(`No indexed item matches ${patterns.join(', ')}.`);
  }
  return [...target.itemIds].filter(([itemPath]) => matched.has(itemPath)).map(([, id]) => id);
}

/** The id of the item at one exact path. */
function idFor(target: SeedTarget, itemPath: string): number {
  const id = target.itemIds.get(itemPath);
  if (id === undefined) {
    throw new Error(`No indexed item at ${itemPath}.`);
  }
  return id;
}

function viewDetails(view: Seed['views'][number]): { viewedAt: string; position?: number } {
  return view.position === undefined
    ? { viewedAt: view.viewedAt }
    : { viewedAt: view.viewedAt, position: view.position };
}

/** Subcategories and their folder mappings, then refiles items by them and files by hand. */
function applySubcategories(target: SeedTarget, seed: Seed): void {
  const { db, rootId } = target;
  for (const subcategory of seed.subcategories) {
    const existing = findSubcategoryBySlug(db, subcategory.section, slugify(subcategory.name));
    const subcategoryId =
      existing?.id ?? insertSubcategory(db, subcategory.section, subcategory.name);
    for (const folder of subcategory.folders) {
      insertFolderMapping(db, { rootId, relPrefix: folder, subcategoryId });
    }
  }
  refileItemsByMappings(db, rootId);
  for (const filing of seed.filedByHand) {
    const subcategory = seed.subcategories.find((entry) => entry.name === filing.subcategory);
    const filedInto =
      subcategory && findSubcategoryBySlug(db, subcategory.section, slugify(subcategory.name));
    if (filedInto === undefined) {
      throw new Error(`Seed files items into an unknown subcategory, ${filing.subcategory}.`);
    }
    fileItemsByHand(db, idsFor(target, filing.items), filedInto.id);
  }
}

/** Pick-list choices, then each item's field values. */
function applyItemFields(target: SeedTarget, seed: Seed): void {
  const { db } = target;
  for (const [key, choices] of Object.entries(seed.picklistChoices)) {
    const field = findFieldByKey(db, 'item', key);
    if (field === undefined) {
      throw new Error(`Seed sets choices for an unknown item field, ${key}.`);
    }
    setPicklistChoices(db, field.id, choices);
  }
  for (const entry of seed.itemFieldValues) {
    for (const itemId of idsFor(target, entry.items)) {
      const subcategoryId = findItemById(db, itemId)?.subcategoryId;
      const scope = subcategoryId === undefined ? {} : { subcategoryId };
      for (const [key, value] of Object.entries(entry.values)) {
        setFieldValue(db, { entity: 'item', entityId: itemId, key, ...scope }, value);
      }
    }
  }
}

/** The model fields, then each model with its details, tags, portrait and appearances. */
function applyModels(target: SeedTarget, seed: Seed): void {
  const { db } = target;
  for (const draft of seed.modelFields) {
    const field = addField(db, { entity: 'model', ...draft });
    if (field.key !== draft.key) {
      throw new Error(`Model field "${draft.label}" gets key ${field.key}, not ${draft.key}.`);
    }
  }
  for (const model of seed.models) {
    const modelId = createModel(db, model.name);
    for (const [key, value] of Object.entries(model.fields)) {
      setFieldValue(db, { entity: 'model', entityId: modelId, key }, value);
    }
    for (const tag of model.tags) {
      tagModel(db, modelId, tag);
    }
    setModelPortrait(db, modelId, idFor(target, model.portrait));
    for (const appearance of model.appearsIn) {
      const itemIds = idsFor(target, appearance.items);
      linkModelToItems(db, modelId, {
        itemIds,
        ...(appearance.pages && { pages: appearance.pages }),
      });
    }
  }
}

/** Item tags, then collections in the seed's order. */
function applyTagsAndCollections(target: SeedTarget, seed: Seed): void {
  const { db, now } = target;
  for (const tag of seed.tags) {
    tagItems(db, idsFor(target, tag.items), tag.name);
  }
  for (const collection of seed.collections) {
    const collectionId = insertCollection(db, collection.name, now);
    addItemsToCollection(db, collectionId, {
      itemIds: idsFor(target, collection.items),
      addedAt: now,
    });
  }
}
