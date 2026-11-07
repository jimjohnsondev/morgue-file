// The parsed form of a query (docs/ARCHITECTURE.md, Search). Every Index page, the search box
// and the filter panel produce one of these, so paging and filters work the same everywhere.

/** The filter keys the query language knows, in the order the canonical form lists them. */
export const FILTER_KEYS = [
  'in',
  'sub',
  'unsorted',
  'tag',
  'model',
  'collection',
  'type',
  'rating',
  'group',
] as const;

/**
 * A filter the language knows by name. Any other `key:value` is a user-defined field. `group:`
 * is the one that doesn't narrow the list: it gathers it by a field (R13).
 */
export type FilterKey = (typeof FILTER_KEYS)[number];

/** One term of a query. Terms are ANDed together; v1 has no OR. */
export type Term =
  | {
      readonly kind: 'filter';
      readonly key: FilterKey;
      readonly value: string;
      readonly isNegated: boolean;
    }
  | {
      readonly kind: 'field';
      readonly key: string;
      readonly value: string;
      readonly isNegated: boolean;
    }
  | { readonly kind: 'word'; readonly value: string; readonly isNegated: boolean }
  | { readonly kind: 'phrase'; readonly value: string; readonly isNegated: boolean };

/** A parsed query: its terms, in canonical order. */
export type Query = {
  readonly terms: readonly Term[];
};

/** Says whether a key is one of the language's own filters. */
export function isFilterKey(key: string): key is FilterKey {
  return (FILTER_KEYS as readonly string[]).includes(key);
}
