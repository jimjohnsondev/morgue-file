// Loads the synthetic perf items into a library through the repositories and field system, so
// the perf tests time the same schema and indexes the app uses.
import { insertItem, refileItemsByMappings, SECTION_BY_KIND } from '#core/db/repositories/items.js';
import { linkModelToItems } from '#core/db/repositories/models.js';
import {
  findSubcategoryBySlug,
  insertFolderMapping,
  insertSubcategory,
} from '#core/db/repositories/subcategories.js';
import { tagItems } from '#core/db/repositories/tags.js';
import { setFieldValue } from '#core/fields/fields.js';
import { createModel } from '#core/models/models.js';
import { slugify } from '#core/slug.js';

import type { Db } from '#core/db/connection.js';
import type { PerfItem } from './perf-plan.ts';

/** The date every perf item was added, so "newest first" follows the file times instead. */
const ADDED_AT = '2026-10-31T12:00:00.000Z';

/** Adds the items, their subcategories, tags, models and ratings in one transaction. */
export function loadPerfItems(db: Db, rootId: number, items: readonly PerfItem[]): void {
  db.transaction(() => {
    addSubcategories(db, rootId, items);
    const added = items.map((item) => ({ item, itemId: insertItem(db, toNewItem(rootId, item)) }));
    refileItemsByMappings(db, rootId);
    const tagged = new Map<string, number[]>();
    const modelled = new Map<string, number[]>();
    for (const { item, itemId } of added) {
      for (const tag of item.tags) {
        addTo(tagged, tag, itemId);
      }
      if (item.model !== undefined) {
        addTo(modelled, item.model, itemId);
      }
      if (item.rating !== undefined) {
        setFieldValue(db, { entity: 'item', entityId: itemId, key: 'rating' }, item.rating);
      }
    }
    for (const [tag, taggedIds] of tagged) {
      tagItems(db, taggedIds, tag);
    }
    for (const [name, modelledIds] of modelled) {
      linkModelToItems(db, createModel(db, name), { itemIds: modelledIds });
    }
  })();
}

/** Adds an item id to the list kept under a name. */
function addTo(lists: Map<string, number[]>, name: string, itemId: number): void {
  const list = lists.get(name);
  if (list === undefined) {
    lists.set(name, [itemId]);
  } else {
    list.push(itemId);
  }
}

/** One subcategory per folder the perf items use (Books and Magazines already exist), mapped to it. */
function addSubcategories(db: Db, rootId: number, items: readonly PerfItem[]): void {
  const folders = new Map(items.map((item) => [item.subcategory, SECTION_BY_KIND[item.kind]]));
  for (const [name, section] of folders) {
    const existing = findSubcategoryBySlug(db, section, slugify(name));
    const subcategoryId = existing?.id ?? insertSubcategory(db, section, name);
    insertFolderMapping(db, { rootId, relPrefix: name, subcategoryId });
  }
}

function toNewItem(rootId: number, item: PerfItem): Parameters<typeof insertItem>[1] {
  return {
    rootId,
    relPath: item.relPath,
    kind: item.kind,
    size: item.size,
    mtimeMs: item.mtimeMs,
    addedAt: ADDED_AT,
    width: item.width,
    height: item.height,
  };
}
