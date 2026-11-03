// Free-form item tags (R10). Names are unique ignoring case, so "Hands" and "hands" are one tag.
import type { Db } from '../connection.js';

/** Returns the id of the tag with this name, creating the tag if it's new. */
export function findOrCreateTagId(db: Db, name: string): number {
  db.prepare('INSERT INTO tags (name) VALUES (?) ON CONFLICT (name) DO NOTHING').run(name);
  const row = db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as { id: number };
  return row.id;
}

/** Tags many items in one transaction, so 200 items are tagged in one action (R10). */
export function tagItems(db: Db, itemIds: readonly number[], tagName: string): void {
  const tagOne = db.prepare(
    'INSERT INTO item_tags (item_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
  );
  db.transaction(() => {
    const tagId = findOrCreateTagId(db, tagName);
    for (const itemId of itemIds) {
      tagOne.run(itemId, tagId);
    }
  })();
}

/** An item's tag names, alphabetically. */
export function findTagNamesByItem(db: Db, itemId: number): string[] {
  const rows = db
    .prepare(
      `SELECT tags.name FROM item_tags JOIN tags ON tags.id = item_tags.tag_id
       WHERE item_tags.item_id = ? ORDER BY tags.name COLLATE NOCASE`,
    )
    .all(itemId) as { name: string }[];
  return rows.map((row) => row.name);
}
