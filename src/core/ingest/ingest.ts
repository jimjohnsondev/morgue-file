// Saves dropped, pasted and fetched files to the Inbox and indexes them at once, so the page can
// say "Saved to Unsorted" and link to the new item (R2; docs/ARCHITECTURE.md, Ingest). A file the
// archive already has isn't copied again; the page links to the item it already is (R8).
import { isReferenceFolderPresent, writeInbox } from '#core/archive/originals.js';
import { findItemByPath } from '#core/db/repositories/items.js';
import { findRootById, REFERENCE_ROOT_ID } from '#core/db/repositories/roots.js';
import { AppError } from '#core/errors.js';
import { hasField, readFieldValues, setFieldValue } from '#core/fields/fields.js';
import { parentFolder, scanFolder } from '#core/indexer/scanner.js';
import { queueThumbnail } from '#core/jobs/thumbnail-jobs.js';

import { findKeptCopy } from './duplicates.js';
import { fetchUrlFile } from './fetch-url.js';
import { cleanFileName, requireKeptKind } from './file-names.js';

import type { FileKind } from '#core/archive/classify.js';
import type { Db } from '#core/db/connection.js';
import type { Root } from '#core/db/repositories/roots.js';
import type { FetchLimits } from './fetch-url.js';
import type { Readable } from 'node:stream';

/** The item a file became, and whether it was already in the archive and so not copied (R8). */
export type IngestResult = {
  readonly itemId: number;
  readonly isDuplicate: boolean;
};

/** Ingested files' thumbnails come after the page being viewed's, before background work. */
const INGEST_PRIORITY = 1;

/** The item field a file's web address is kept in (R2, R11). */
const SOURCE_URL_FIELD_KEY = 'source_url';

/** The library to save into, and what to tell when the new item's thumbnail is queued. */
export type IngestContext = {
  readonly db: Db;
  readonly wakeQueue: () => void;
  /** Tests fix the clock, which picks the Inbox's month folder. */
  readonly now?: () => Date;
};

/** A file arriving from the page, with the address the browser said it came from, if any. */
export type IncomingFile = {
  readonly fileName: string;
  readonly content: Readable;
  readonly sourceUrl?: string | undefined;
};

/** The Inbox folder a file saved at this time goes in: `YYYY-MM`, in the PC's own time. */
export function inboxMonthFolder(now: Date): string {
  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Keeps a source address only if it is a web address; a `data:` or `file:` one says nothing. */
function webAddressOrUndefined(address: string | undefined): string | undefined {
  if (address === undefined || !URL.canParse(address)) {
    return undefined;
  }
  const { protocol } = new URL(address);
  return protocol === 'http:' || protocol === 'https:' ? address : undefined;
}

/**
 * The Reference folder to save into. It must be there now: an offline drive is refused rather
 * than having a new Inbox made in its place.
 */
async function requireOnlineRoot(db: Db): Promise<Root> {
  const root = findRootById(db, REFERENCE_ROOT_ID);
  if (root === undefined) {
    throw new AppError('library-unavailable', 'Choose a Reference folder before adding files.');
  }
  if (root.status === 'offline' || !(await isReferenceFolderPresent(root.path))) {
    throw new AppError(
      'reference-offline',
      `The Reference folder ${root.path} can't be reached, so the file wasn't saved.`,
    );
  }
  return root;
}

/** Indexes the new file's folder now, rather than waiting for the watcher, and returns its item. */
async function indexSavedFile(context: IngestContext, root: Root, relPath: string) {
  const now = context.now?.() ?? new Date();
  await scanFolder(
    { db: context.db, rootId: root.id, rootPath: root.path, now: () => now },
    { relDir: parentFolder(relPath), isShallow: true },
  );
  const item = findItemByPath(context.db, root.id, relPath);
  if (item === undefined) {
    throw new AppError('media-unreadable', `${relPath} was saved but couldn't be indexed.`);
  }
  return { item, now };
}

/**
 * Keeps a file's web address in the item's source_url field. Settings can remove the field; the
 * file is saved all the same. A copy of a kept file only fills in an address the item lacks.
 */
function keepSourceUrl(
  db: Db,
  saved: { readonly itemId: number; readonly isDuplicate: boolean },
  sourceUrl: string | undefined,
): void {
  if (sourceUrl === undefined || !hasField(db, { entity: 'item' }, SOURCE_URL_FIELD_KEY)) {
    return;
  }
  const field = { entity: 'item', entityId: saved.itemId, key: SOURCE_URL_FIELD_KEY } as const;
  const hasSource = readFieldValues(db, field).some(
    (entry) => entry.field.key === SOURCE_URL_FIELD_KEY && entry.value !== undefined,
  );
  if (!saved.isDuplicate || !hasSource) {
    setFieldValue(db, field, sourceUrl);
  }
}

/** What became of a written file: saved at a path, or dropped as a copy of an item. */
type Written =
  | { readonly isCopy: false; readonly relPath: string }
  | { readonly isCopy: true; readonly itemId: number };

/**
 * Writes a file to `Inbox/YYYY-MM/` under a cleaned, unused name, unless it is a copy of a file
 * the archive already has (R8), which is removed again once its bytes have been compared.
 */
async function writeUnlessKept(
  context: IngestContext,
  root: Root,
  file: { readonly fileName: string; readonly kind: FileKind; readonly content: Readable },
): Promise<Written> {
  const found: { copyOf?: number } = {};
  const relPath = await writeInbox(root.path, {
    folderName: inboxMonthFolder(context.now?.() ?? new Date()),
    fileName: file.fileName,
    content: file.content,
    shouldKeep: async (receivedRelPath) => {
      const copyOf = await findKeptCopy(context.db, {
        rootPath: root.path,
        relPath: receivedRelPath,
        kind: file.kind,
      });
      if (copyOf !== undefined) {
        found.copyOf = copyOf;
      }
      return copyOf === undefined;
    },
  });
  if (found.copyOf !== undefined) {
    return { isCopy: true, itemId: found.copyOf };
  }
  if (relPath === undefined) {
    throw new AppError('media-unreadable', `${file.fileName} couldn't be saved.`);
  }
  return { isCopy: false, relPath };
}

/**
 * Saves one file to `Inbox/YYYY-MM/` under a cleaned, unused name, indexes it, keeps its source
 * address in the source_url field, and queues its thumbnail ahead of background work. A file the
 * archive already has is not saved again: its item is returned instead (R8). A file of a type
 * the archive doesn't keep is refused before anything is written.
 */
export async function ingestFile(
  context: IngestContext,
  file: IncomingFile,
): Promise<IngestResult> {
  const { db } = context;
  const fileName = cleanFileName(file.fileName);
  const kind = requireKeptKind(fileName);
  const root = await requireOnlineRoot(db);
  const sourceUrl = webAddressOrUndefined(file.sourceUrl);
  const written = await writeUnlessKept(context, root, { fileName, kind, content: file.content });
  if (written.isCopy) {
    const kept = { itemId: written.itemId, isDuplicate: true };
    db.transaction(() => {
      keepSourceUrl(db, kept, sourceUrl);
    })();
    return kept;
  }
  const { item, now } = await indexSavedFile(context, root, written.relPath);
  const saved = { itemId: item.id, isDuplicate: false };
  db.transaction(() => {
    queueThumbnail(db, {
      itemId: item.id,
      kind: item.kind,
      priority: INGEST_PRIORITY,
      now: now.toISOString(),
    });
    keepSourceUrl(db, saved, sourceUrl);
  })();
  context.wakeQueue();
  return saved;
}

/**
 * Fetches the file at a web address dragged onto a page with no file attached, then saves it as
 * a dropped file whose source is that address (R2).
 */
export async function ingestUrl(
  context: IngestContext,
  address: string,
  limits?: FetchLimits,
): Promise<IngestResult> {
  if (!URL.canParse(address)) {
    throw new AppError('invalid-input', `${address} is not a web address.`);
  }
  const fetched = await fetchUrlFile(new URL(address), limits);
  try {
    return await ingestFile(context, { ...fetched, sourceUrl: address });
  } finally {
    // Ends the download if the save was refused before reading it.
    fetched.content.destroy();
  }
}
