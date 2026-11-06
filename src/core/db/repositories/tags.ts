// Free-form item tags (R10). Names are unique ignoring case, so "Hands" and "hands" are one tag.
import { AppError } from '#core/errors.js';

import type { Db } from '../connection.js';

/** Returns the id of the tag with this name, creating the tag if it's new. */
export function findOrCreateTagId(db: Db, name: string): number {
  requireTagName(name);
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

/**
 * Takes a tag off many items in one transaction (R10) and returns how many had it. An unknown tag
 * changes nothing.
 */
export function untagItems(db: Db, itemIds: readonly number[], tagName: string): number {
  const untagOne = db.prepare(
    'DELETE FROM item_tags WHERE item_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)',
  );
  return db.transaction(() => {
    let untagged = 0;
    for (const itemId of itemIds) {
      untagged += untagOne.run(itemId, tagName).changes;
    }
    return untagged;
  })();
}

/** A tag and how many items carry it, for the suggestions under a tag field. */
export type TagSuggestion = {
  readonly name: string;
  readonly itemCount: number;
};

/**
 * The tags whose names start with the typed text, ignoring case, most used first. LIKE's own
 * wildcards in the text are escaped, so "50%" matches only itself.
 */
export function findTagSuggestions(db: Db, typed: string, limit: number): TagSuggestion[] {
  const pattern = `${typed.replaceAll(/[\\%_]/g, (wildcard) => `\\${wildcard}`)}%`;
  const rows = db
    .prepare(
      `SELECT tags.name, count(item_tags.item_id) AS item_count FROM tags
       LEFT JOIN item_tags ON item_tags.tag_id = tags.id
       WHERE tags.name LIKE ? ESCAPE '\\'
       GROUP BY tags.id ORDER BY item_count DESC, tags.name COLLATE NOCASE LIMIT ?`,
    )
    .all(pattern, limit) as { name: string; item_count: number }[];
  return rows.map((row) => ({ name: row.name, itemCount: row.item_count }));
}

/** Each item's tag names by item id, for the cards of one Index page. Untagged items are left out. */
export function findTagNamesByItems(db: Db, itemIds: readonly number[]): Map<number, string[]> {
  const rows = db
    .prepare(
      `SELECT item_tags.item_id, tags.name FROM json_each(?) AS wanted
       JOIN item_tags ON item_tags.item_id = wanted.value
       JOIN tags ON tags.id = item_tags.tag_id
       ORDER BY tags.name COLLATE NOCASE`,
    )
    .all(JSON.stringify(itemIds)) as { item_id: number; name: string }[];
  const names = new Map<number, string[]>();
  for (const row of rows) {
    names.set(row.item_id, [...(names.get(row.item_id) ?? []), row.name]);
  }
  return names;
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

/** Refuses an empty tag, which would show as a blank link. Shared with model tags. */
export function requireTagName(name: string): void {
  if (name.trim() === '' || name !== name.trim()) {
    throw new AppError('invalid-input', 'A tag needs a name, with no spaces at either end.');
  }
}
