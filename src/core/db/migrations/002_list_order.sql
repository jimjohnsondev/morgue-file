-- Index pages list a section oldest first by date added (docs/ARCHITECTURE.md, As built in
-- PR 7). Without this index a deep page of a 50,000-item section sorts the whole section (R18).
CREATE INDEX items_in_list_order ON items (section, added_at, id);
