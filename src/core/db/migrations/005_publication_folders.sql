-- Folders Jim has made into one publication (a page folder) by hand, from the action panel. The
-- scanner treats each as a page folder whatever its files are named, so scans named like
-- "Issue_b 19.jpg" read as one publication instead of loose photos. Deleting a row turns it back.
CREATE TABLE publication_folders (
  root_id INTEGER NOT NULL REFERENCES roots (id),
  -- Forward slashes, like items.rel_path; case-insensitive, as Windows paths are.
  rel_path TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (root_id, rel_path)
) STRICT;
