// Reads what the shared frame shows around any page: the Reference folder offline (E3), the
// index still running (E5), and the "Saved to Unsorted" notice after a drop (E6).
import { Type } from '@sinclair/typebox';

import { findItemById } from '#core/db/repositories/items.js';
import { countKeptItems, findRootById, REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { readFieldValues } from '#core/fields/fields.js';

import { itemLabel } from '../views/format.js';

import type { Db } from '#core/db/connection.js';
import type { PageContext } from './page-context.js';
import type { OfflineNotice, PageStatus, SavedNotice } from '../views/parts/status-notices.js';

/** Any page can carry `saved=<item id>`, the item a drop just made, to show its notice (E6). */
export const SavedQuerystring = Type.Object({
  saved: Type.Optional(Type.Integer({ minimum: 1 })),
});

/** The field an item's source address is kept in (R2, R11). */
const SOURCE_URL_FIELD_KEY = 'source_url';

/** The page being drawn: its address, and the item named by `saved`, if any. */
export type PageRequest = {
  readonly url: string;
  readonly savedId: number | undefined;
};

/** The Reference folder's notice, if its last check found it offline. */
function readOfflineNotice(db: Db): OfflineNotice | undefined {
  const root = findRootById(db, REFERENCE_ROOT_ID);
  if (root?.status !== 'offline') {
    return undefined;
  }
  return { folder: root.path, itemCount: countKeptItems(db, root.id) };
}

/** The site an item came from, from its source address, if it has a valid one. */
function sourceHostOf(db: Db, itemId: number): string | undefined {
  const fields = readFieldValues(db, { entity: 'item', entityId: itemId });
  const source = fields.find((entry) => entry.field.key === SOURCE_URL_FIELD_KEY)?.value;
  return typeof source === 'string' && URL.canParse(source) ? new URL(source).hostname : undefined;
}

/** The page's address without `saved`, so "dismiss" lands on the same page, notice gone. */
function withoutSaved(url: string): string {
  const address = new URL(url, 'http://localhost');
  address.searchParams.delete('saved');
  // A path that collapses to `//host` would read as another site's address; keep it on this one.
  return `${address.pathname.replace(/^\/+/, '/')}${address.search}`;
}

/** The notice for the item a drop just made, or none if `saved` names no item. */
function readSavedNotice(db: Db, page: PageRequest): SavedNotice | undefined {
  const item = page.savedId === undefined ? undefined : findItemById(db, page.savedId);
  if (item === undefined) {
    return undefined;
  }
  return {
    itemHref: `/item/${String(item.id)}`,
    name: itemLabel(item),
    sourceHost: sourceHostOf(db, item.id),
    dismissHref: withoutSaved(page.url),
  };
}

/** Everything the frame shows besides the page; nothing at all before the library is open. */
export function readPageStatus(context: PageContext, page: PageRequest): PageStatus {
  const db = context.library?.open()?.db;
  if (db === undefined) {
    return {};
  }
  return {
    offline: readOfflineNotice(db),
    indexing: context.library?.indexing(),
    saved: readSavedNotice(db, page),
  };
}
