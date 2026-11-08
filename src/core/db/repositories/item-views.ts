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

type ItemViewRow = { item_id: number; viewed_at: string; position: number | null };

function toItemView(row: ItemViewRow): ItemView {
  return {
    itemId: row.item_id,
    viewedAt: row.viewed_at,
    ...(row.position === null ? {} : { position: row.position }),
  };
}

/**
 * Records a view and drops any beyond the newest 200. A view of the item viewed last replaces that
 * view instead, keeping its position if the new one has none: turning a reader's pages or pausing
 * a video reloads or re-sends the same opening, which is one entry in the history (R35).
 */
export function recordItemView(db: Db, view: ItemView): void {
  db.transaction(() => {
    const latest = db
      .prepare('SELECT id, item_id FROM item_views ORDER BY viewed_at DESC, id DESC LIMIT 1')
      .get() as { id: number; item_id: number } | undefined;
    if (latest?.item_id === view.itemId) {
      db.prepare(
        'UPDATE item_views SET viewed_at = ?, position = coalesce(?, position) WHERE id = ?',
      ).run(view.viewedAt, view.position ?? null, latest.id);
      return;
    }
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
    .all(limit) as ItemViewRow[];
  return rows.map(toItemView);
}

/** The items viewed last, each once at its latest view, newest first (Home's first strip). */
export function findRecentlyViewedItems(db: Db, limit: number): ItemView[] {
  const rows = db
    .prepare(
      `SELECT item_id, viewed_at, position FROM item_views AS view
       WHERE id = (SELECT id FROM item_views WHERE item_id = view.item_id
         ORDER BY viewed_at DESC, id DESC LIMIT 1)
       ORDER BY viewed_at DESC, id DESC LIMIT ?`,
    )
    .all(limit) as ItemViewRow[];
  return rows.map(toItemView);
}
