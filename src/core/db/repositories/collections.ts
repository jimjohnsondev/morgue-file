// Collections: flat, hand-made groups of items. An item can sit in many (R9).
import type { Db } from '../connection.js';

/** A collection and how many items it holds. */
export type CollectionSummary = {
  readonly id: number;
  readonly name: string;
  readonly itemCount: number;
};

/** Makes an empty collection and returns its id. */
export function insertCollection(db: Db, name: string, createdAt: string): number {
  const result = db
    .prepare('INSERT INTO collections (name, created_at) VALUES (?, ?)')
    .run(name, createdAt);
  return Number(result.lastInsertRowid);
}

/**
 * Adds items to the end of a collection in one transaction, in the order given. Items already
 * in it keep their place.
 */
export function addItemsToCollection(
  db: Db,
  collectionId: number,
  items: { readonly itemIds: readonly number[]; readonly addedAt: string },
): void {
  const addOne = db.prepare(
    `INSERT INTO collection_items (collection_id, item_id, position, added_at)
     VALUES (?, ?,
       (SELECT coalesce(max(position), 0) + 1 FROM collection_items WHERE collection_id = ?), ?)
     ON CONFLICT DO NOTHING`,
  );
  db.transaction(() => {
    for (const itemId of items.itemIds) {
      addOne.run(collectionId, itemId, collectionId, items.addedAt);
    }
  })();
}

/** Every collection with its size, oldest first. */
export function findCollectionSummaries(db: Db): CollectionSummary[] {
  const rows = db
    .prepare(
      `SELECT collections.id, collections.name, count(collection_items.item_id) AS item_count
       FROM collections
       LEFT JOIN collection_items ON collection_items.collection_id = collections.id
       GROUP BY collections.id ORDER BY collections.id`,
    )
    .all() as { id: number; name: string; item_count: number }[];
  return rows.map((row) => ({ id: row.id, name: row.name, itemCount: row.item_count }));
}

/** The item ids in a collection, in its order. */
export function findItemIdsByCollection(db: Db, collectionId: number): number[] {
  const rows = db
    .prepare('SELECT item_id FROM collection_items WHERE collection_id = ? ORDER BY position')
    .all(collectionId) as { item_id: number }[];
  return rows.map((row) => row.item_id);
}

/** The collections an item sits in, by name, for the chips on its Item page. */
export function findCollectionsByItem(db: Db, itemId: number): { id: number; name: string }[] {
  return db
    .prepare(
      `SELECT collections.id, collections.name FROM collection_items
       JOIN collections ON collections.id = collection_items.collection_id
       WHERE collection_items.item_id = ? ORDER BY collections.name COLLATE NOCASE`,
    )
    .all(itemId) as { id: number; name: string }[];
}

/** The first item of each collection that has any, by collection id, to stand as its cover. */
export function findCollectionCoverIds(db: Db): Map<number, number> {
  const rows = db
    .prepare(
      `SELECT collection_id, item_id FROM collection_items AS entry
       WHERE position = (SELECT min(position) FROM collection_items
         WHERE collection_id = entry.collection_id)`,
    )
    .all() as { collection_id: number; item_id: number }[];
  return new Map(rows.map((row) => [row.collection_id, row.item_id]));
}
