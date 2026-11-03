-- The first schema: every table in docs/ARCHITECTURE.md (Data model) except the full-text search
-- tables, which arrive with the query language (build plan PR 15).

CREATE TABLE roots (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'offline')),
  last_scan_at TEXT
) STRICT;

CREATE TABLE subcategories (
  id INTEGER PRIMARY KEY,
  section TEXT NOT NULL CHECK (section IN ('photos', 'video', 'library')),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  position INTEGER NOT NULL,
  thumb_shape TEXT NOT NULL CHECK (thumb_shape IN ('square', 'cover')),
  group_by TEXT,
  UNIQUE (section, slug)
) STRICT;

CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  root_id INTEGER NOT NULL REFERENCES roots (id),
  -- Forward slashes; Windows paths are case-insensitive, so the same file can't get two rows.
  rel_path TEXT NOT NULL COLLATE NOCASE,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video', 'pdf', 'cbz', 'pagefolder')),
  section TEXT NOT NULL CHECK (section IN ('photos', 'video', 'library')),
  subcategory_id INTEGER REFERENCES subcategories (id) ON DELETE SET NULL,
  subcategory_manual INTEGER NOT NULL DEFAULT 0 CHECK (subcategory_manual IN (0, 1)),
  size INTEGER NOT NULL,
  mtime INTEGER NOT NULL,
  partial_hash TEXT,
  full_hash TEXT,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  fps REAL,
  page_count INTEGER,
  added_at TEXT NOT NULL,
  missing_since TEXT,
  thumb_state TEXT NOT NULL DEFAULT 'pending' CHECK (thumb_state IN ('pending', 'ready', 'failed')),
  UNIQUE (root_id, rel_path)
) STRICT;

CREATE INDEX items_by_place ON items (section, subcategory_id, added_at DESC, id);

CREATE TABLE folder_mappings (
  id INTEGER PRIMARY KEY,
  root_id INTEGER NOT NULL REFERENCES roots (id),
  rel_prefix TEXT NOT NULL COLLATE NOCASE,
  subcategory_id INTEGER NOT NULL REFERENCES subcategories (id) ON DELETE CASCADE,
  UNIQUE (root_id, rel_prefix)
) STRICT;

CREATE TABLE fields (
  id INTEGER PRIMARY KEY,
  entity TEXT NOT NULL CHECK (entity IN ('item', 'model')),
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text', 'longtext', 'link', 'date', 'number', 'picklist')),
  options TEXT NOT NULL DEFAULT '[]',
  scope INTEGER REFERENCES subcategories (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  builtin INTEGER NOT NULL DEFAULT 0 CHECK (builtin IN (0, 1)),
  removed_at TEXT,
  UNIQUE (entity, key)
) STRICT;

CREATE TABLE field_values (
  entity TEXT NOT NULL CHECK (entity IN ('item', 'model')),
  entity_id INTEGER NOT NULL,
  field_id INTEGER NOT NULL REFERENCES fields (id) ON DELETE CASCADE,
  value_text TEXT,
  value_num REAL,
  PRIMARY KEY (entity, entity_id, field_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX field_values_by_field ON field_values (field_id, value_num, entity_id);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
) STRICT;

CREATE TABLE item_tags (
  item_id INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX item_tags_by_tag ON item_tags (tag_id, item_id);

CREATE TABLE collections (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE collection_items (
  collection_id INTEGER NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (collection_id, item_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX collection_items_in_order ON collection_items (collection_id, position);

CREATE TABLE models (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  portrait_item_id INTEGER REFERENCES items (id) ON DELETE SET NULL
) STRICT;

CREATE TABLE model_tags (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
) STRICT;

CREATE TABLE model_tag_links (
  model_id INTEGER NOT NULL REFERENCES models (id) ON DELETE CASCADE,
  model_tag_id INTEGER NOT NULL REFERENCES model_tags (id) ON DELETE CASCADE,
  PRIMARY KEY (model_id, model_tag_id)
) STRICT, WITHOUT ROWID;

-- A NULL page range means the whole item (R17).
CREATE TABLE item_models (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  model_id INTEGER NOT NULL REFERENCES models (id) ON DELETE CASCADE,
  page_from INTEGER,
  page_to INTEGER,
  CHECK ((page_from IS NULL) = (page_to IS NULL)),
  CHECK (page_from IS NULL OR (page_from >= 1 AND page_from <= page_to))
) STRICT;

CREATE INDEX item_models_by_model ON item_models (model_id, item_id);
CREATE INDEX item_models_by_item ON item_models (item_id);

CREATE TABLE saved_searches (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  q TEXT NOT NULL
) STRICT;

CREATE TABLE item_views (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  viewed_at TEXT NOT NULL,
  position REAL
) STRICT;

CREATE INDEX item_views_by_time ON item_views (viewed_at DESC);

CREATE TABLE jobs (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  item_id INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  priority INTEGER NOT NULL CHECK (priority IN (0, 1, 2)),
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'done', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX jobs_to_run ON jobs (state, priority, id DESC);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

-- Seeded subcategories: Library starts with Books and Magazines; Magazines groups by title.
INSERT INTO subcategories (section, name, slug, position, thumb_shape, group_by) VALUES
  ('library', 'Books', 'books', 1, 'cover', NULL),
  ('library', 'Magazines', 'magazines', 2, 'cover', '{"field":"magazine_title"}');

-- Seeded fields. Templates render whatever this table holds (R11, R14).
INSERT INTO fields (entity, key, label, type, options, scope, position, builtin) VALUES
  ('item', 'notes', 'Notes', 'longtext', '[]', NULL, 1, 1),
  ('item', 'source_url', 'Source URL', 'link', '[]', NULL, 2, 1),
  ('item', 'rating', 'Rating', 'number', '[]', NULL, 3, 1),
  ('item', 'magazine_title', 'Magazine', 'picklist', '[]',
    (SELECT id FROM subcategories WHERE slug = 'magazines'), 4, 1),
  ('item', 'issue_date', 'Issue date', 'date', '[]',
    (SELECT id FROM subcategories WHERE slug = 'magazines'), 5, 1),
  ('model', 'name', 'Name', 'text', '[]', NULL, 1, 1),
  ('model', 'bio', 'Bio', 'longtext', '[]', NULL, 2, 1);
