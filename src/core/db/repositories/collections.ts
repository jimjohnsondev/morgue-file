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
