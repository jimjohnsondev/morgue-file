// How workers name the original they read: a root and a path under it, never a bare path, so
// every read goes through originals.ts and its check that the path stays inside the root.

/** An item's original file or folder. */
export type OriginalRef = {
  readonly rootPath: string;
  /** Relative to the root, with forward slashes. */
  readonly relPath: string;
};
