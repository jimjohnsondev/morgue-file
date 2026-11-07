-- Full-text search over items and models (docs/ARCHITECTURE.md, Search tables; R24). Each
-- search row is written from its source view by app code in the same transaction as the change
-- it follows (repositories/search-rows.ts); there are no triggers across joins. name_words() is
-- registered on every connection by openDatabase().
CREATE VIRTUAL TABLE item_search USING fts5 (
  name,
  tags,
  collections,
  subcategory,
  fields,
  models,
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3'
);

CREATE VIRTUAL TABLE model_search USING fts5 (
  fields,
  tags,
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3'
);

-- What an item's search row holds: its file name's words, tags, collections, subcategory, the
-- text of its own fields (notes, a magazine's title) and the names of the models in it.
CREATE VIEW item_search_source AS
SELECT
  items.id AS item_id,
  name_words(items.rel_path) AS name,
  (SELECT group_concat(tags.name, ' ') FROM item_tags
    JOIN tags ON tags.id = item_tags.tag_id
    WHERE item_tags.item_id = items.id) AS tags,
  (SELECT group_concat(collections.name, ' ') FROM collection_items
    JOIN collections ON collections.id = collection_items.collection_id
    WHERE collection_items.item_id = items.id) AS collections,
  (SELECT subcategories.name FROM subcategories
    WHERE subcategories.id = items.subcategory_id) AS subcategory,
  (SELECT group_concat(field_values.value_text, ' ') FROM field_values
    JOIN fields ON fields.id = field_values.field_id
    WHERE field_values.entity = 'item' AND field_values.entity_id = items.id
      AND fields.type IN ('text', 'longtext', 'picklist') AND fields.removed_at IS NULL) AS fields,
  (SELECT group_concat(field_values.value_text, ' ') FROM item_models
    JOIN field_values ON field_values.entity = 'model'
      AND field_values.entity_id = item_models.model_id
      AND field_values.field_id = (SELECT id FROM fields WHERE entity = 'model' AND key = 'name')
    WHERE item_models.item_id = items.id) AS models
FROM items;

-- What a model's search row holds: the text of its fields (name, bio, agency …) and its tags.
CREATE VIEW model_search_source AS
SELECT
  models.id AS model_id,
  (SELECT group_concat(field_values.value_text, ' ') FROM field_values
    JOIN fields ON fields.id = field_values.field_id
    WHERE field_values.entity = 'model' AND field_values.entity_id = models.id
      AND field_values.value_text IS NOT NULL AND fields.removed_at IS NULL) AS fields,
  (SELECT group_concat(model_tags.name, ' ') FROM model_tag_links
    JOIN model_tags ON model_tags.id = model_tag_links.model_tag_id
    WHERE model_tag_links.model_id = models.id) AS tags
FROM models;

-- An item's collections are read for its search row; without this each read scans them all.
CREATE INDEX collection_items_by_item ON collection_items (item_id);

INSERT INTO item_search (rowid, name, tags, collections, subcategory, fields, models)
SELECT * FROM item_search_source;

INSERT INTO model_search (rowid, fields, tags)
SELECT * FROM model_search_source;
