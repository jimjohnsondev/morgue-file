// Folders made into one publication by hand (migration 005). The scanner reads them as page
// folders; see makeFolderPublication in core/organize/publication-folders.ts.
import type { Db } from '../connection.js';

/** Records a folder as a publication; recording it again changes nothing. */
export function insertPublicationFolder(
  db: Db,
  folder: { readonly rootId: number; readonly relPath: string; readonly now: string },
): void {
  db.prepare(
    'INSERT OR IGNORE INTO publication_folders (root_id, rel_path, created_at) VALUES (?, ?, ?)',
  ).run(folder.rootId, folder.relPath, folder.now);
}

/** Forgets a folder as a publication, so it reads as loose photos again. */
export function deletePublicationFolder(db: Db, rootId: number, relPath: string): void {
  db.prepare('DELETE FROM publication_folders WHERE root_id = ? AND rel_path = ?').run(
    rootId,
    relPath,
  );
}

/** Says whether a folder was made a publication by hand. */
export function isPublicationFolder(db: Db, rootId: number, relPath: string): boolean {
  const row = db
    .prepare('SELECT 1 AS found FROM publication_folders WHERE root_id = ? AND rel_path = ?')
    .get(rootId, relPath);
  return row !== undefined;
}

/** The folders of a root made publications by hand, as stored. */
export function findPublicationFolderPaths(db: Db, rootId: number): string[] {
  const rows = db
    .prepare('SELECT rel_path FROM publication_folders WHERE root_id = ?')
    .all(rootId) as { rel_path: string }[];
  return rows.map((row) => row.rel_path);
}
