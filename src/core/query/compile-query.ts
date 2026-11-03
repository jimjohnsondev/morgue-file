// Compiles a parsed query into a SQL condition on `items` with bound parameters
// (docs/ARCHITECTURE.md, Search). The SQL text is built only from the fixed fragments below;
// every value from the query is a parameter, never pasted into the text. Repositories run it.
import { AppError } from '#core/errors.js';

import type { Query, Term } from './query-types.js';

/** A condition on the `items` table and the values for its `?` placeholders, in order. */
export type CompiledQuery = {
  readonly where: string;
  readonly params: readonly (string | number)[];
  /** True when the query keeps to one section (`in:photos`), so lists need not sort by section. */
  readonly isOneSection: boolean;
};

type Fragment = Omit<CompiledQuery, 'isOneSection'>;

/** The item kinds `type:` accepts by name; anything else is taken as a file extension. */
const KIND_NAMES: ReadonlySet<string> = new Set(['image', 'video', 'pdf', 'cbz', 'pagefolder']);

/** `rating:4` or `rating:3+`. */
const RATING = /^([1-5])(\+?)$/;

/** Escapes LIKE's wildcards, so a `%` or `_` in a value matches only itself. */
function escapeLike(value: string): string {
  return value.replaceAll(/[\\%_]/g, (character) => `\\${character}`);
}

/** Items holding a value of one of their own fields, found through the field's key. */
function itemFieldSql(condition: string): string {
  return `items.id IN (SELECT field_values.entity_id FROM field_values
    WHERE field_values.entity = 'item' AND field_values.field_id =
      (SELECT id FROM fields WHERE entity = 'item' AND key = ? AND removed_at IS NULL)
      AND ${condition})`;
}

function ratingFragment(value: string): Fragment {
  const match = RATING.exec(value);
  if (match === null) {
    throw new AppError('invalid-input', 'rating: takes 1 to 5, or 3+ for "3 or more".');
  }
  const comparison = match[2] === '+' ? '>=' : '=';
  return {
    where: itemFieldSql(`field_values.value_num ${comparison} ?`),
    params: ['rating', Number(match[1])],
  };
}

function typeFragment(value: string): Fragment {
  return KIND_NAMES.has(value)
    ? { where: 'items.kind = ?', params: [value] }
    : { where: `items.rel_path LIKE ? ESCAPE '\\'`, params: [`%.${escapeLike(value)}`] };
}

function modelFragment(value: string): Fragment {
  return {
    where: `items.id IN (SELECT item_models.item_id FROM item_models
      JOIN field_values ON field_values.entity = 'model'
        AND field_values.entity_id = item_models.model_id
      WHERE field_values.field_id = (SELECT id FROM fields WHERE entity = 'model' AND key = 'name')
        AND field_values.value_text LIKE ? ESCAPE '\\')`,
    params: [`${escapeLike(value)}%`],
  };
}

/** A collection by id when the value is a number (`/collections/12`), else by name. */
function collectionFragment(value: string): Fragment {
  const isId = /^\d+$/.test(value);
  return {
    where: `items.id IN (SELECT collection_items.item_id FROM collection_items
      WHERE collection_items.collection_id IN (SELECT id FROM collections WHERE ${
        isId ? 'id = ?' : 'name = ? COLLATE NOCASE'
      }))`,
    params: [isId ? Number(value) : value],
  };
}

/** The condition for one of the language's own filters. */
function filterFragment(term: Extract<Term, { kind: 'filter' }>): Fragment {
  switch (term.key) {
    case 'in':
      return { where: 'items.section = ?', params: [term.value] };
    case 'sub':
      return {
        where: 'items.subcategory_id IN (SELECT id FROM subcategories WHERE slug = ?)',
        params: [term.value],
      };
    case 'unsorted':
      return { where: 'items.subcategory_id IS NULL', params: [] };
    case 'tag':
      return {
        where: `items.id IN (SELECT item_tags.item_id FROM item_tags
          JOIN tags ON tags.id = item_tags.tag_id WHERE tags.name = ?)`,
        params: [term.value],
      };
    case 'model':
      return modelFragment(term.value);
    case 'collection':
      return collectionFragment(term.value);
    case 'type':
      return typeFragment(term.value);
    case 'rating':
      return ratingFragment(term.value);
  }
}

/**
 * The condition for one term. Words and phrases match the file path until full-text search
 * arrives with the search grammar (build plan PR 15).
 */
function termFragment(term: Term): Fragment {
  switch (term.kind) {
    case 'filter':
      return filterFragment(term);
    case 'field':
      return {
        where: itemFieldSql(`field_values.value_text LIKE ? ESCAPE '\\'`),
        params: [term.key, `%${escapeLike(term.value)}%`],
      };
    case 'word':
    case 'phrase':
      return {
        where: `items.rel_path LIKE ? ESCAPE '\\'`,
        params: [`%${escapeLike(term.value)}%`],
      };
  }
}

/** Compiles a query into one condition: its terms ANDed, each negated where it says so. */
export function compileQuery(query: Query): CompiledQuery {
  const isOneSection = query.terms.some(
    (term) => term.kind === 'filter' && term.key === 'in' && !term.isNegated,
  );
  if (query.terms.length === 0) {
    return { where: '1 = 1', params: [], isOneSection };
  }
  const fragments = query.terms.map((term) => {
    const fragment = termFragment(term);
    return term.isNegated ? { ...fragment, where: `NOT (${fragment.where})` } : fragment;
  });
  return {
    where: fragments.map((fragment) => `(${fragment.where})`).join(' AND '),
    params: fragments.flatMap((fragment) => fragment.params),
    isOneSection,
  };
}
