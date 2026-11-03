// Viewing history for Home's Recently viewed strip (R35). Only the latest views are kept.
import type { Db } from '../connection.js';

/** How many views are kept; older ones are deleted as new ones arrive. */
export const KEPT_VIEWS = 200;

/** One opening of an item, with where the viewer got to (video seconds or page). */
export type ItemView = {
  readonly itemId: number;
  readonly viewedAt: string;
  readonly position?: number;
};

/** Records a view and drops any beyond the newest 200. */
export function recordItemView(db: Db, view: ItemView): void {
  db.transaction(() => {
    db.prepare('INSERT INTO item_views (item_id, viewed_at, position) VALUES (?, ?, ?)').run(
      view.itemId,
      view.viewedAt,
      view.position ?? null,
    );
    db.prepare(
      `DELETE FROM item_views WHERE id NOT IN (
         SELECT id FROM item_views ORDER BY viewed_at DESC, id DESC LIMIT ?)`,
    ).run(KEPT_VIEWS);
  })();
}

/** The most recent views, newest first. */
export function findRecentItemViews(db: Db, limit: number): ItemView[] {
  const rows = db
    .prepare(
      `SELECT item_id, viewed_at, position FROM item_views
       ORDER BY viewed_at DESC, id DESC LIMIT ?`,
    )
    .all(limit) as { item_id: number; viewed_at: string; position: number | null }[];
  return rows.map((row) => ({
    itemId: row.item_id,
    viewedAt: row.viewed_at,
    ...(row.position === null ? {} : { position: row.position }),
  }));
}
