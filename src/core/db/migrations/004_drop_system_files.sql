-- Removes items that are operating-system clutter, which the scanner now skips (see
-- isSystemEntry in src/core/archive/classify.ts): anything with a path part starting with a dot,
-- such as macOS's "._name.jpg" metadata files or a ".Trashes" folder, and anything in a
-- __MACOSX, $RECYCLE.BIN or System Volume Information folder. None of them were real
-- references, so their tags, collections and other links are removed with them.
CREATE TEMP TABLE system_items AS
SELECT id FROM items
WHERE ('/' || rel_path) LIKE '%/.%'
  OR ('/' || rel_path || '/') LIKE '%/\_\_macosx/%' ESCAPE '\'
  OR ('/' || rel_path || '/') LIKE '%/$recycle.bin/%'
  OR ('/' || rel_path || '/') LIKE '%/system volume information/%';

DELETE FROM item_search WHERE rowid IN (SELECT id FROM system_items);
DELETE FROM items WHERE id IN (SELECT id FROM system_items);
DROP TABLE system_items;
