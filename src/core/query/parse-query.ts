// Reads a query string (`tag:hands model:Elena -type:gif`) into terms in canonical order. It
// never fails: anything that isn't a known shape is a search word.
import { canonicalOrder } from './canonical-query.js';
import { isFilterKey } from './query-types.js';

import type { FilterKey, Query, Term } from './query-types.js';

/** A field or filter key: letters of any script, digits and underscores (`agency_link`). */
const KEY = /^[\p{L}\p{N}_]+$/u;

/** A piece of the query string: its text, whether it was quoted, and whether it was negated. */
type Token = {
  readonly key: string | undefined;
  readonly value: string;
  readonly isQuoted: boolean;
  readonly isNegated: boolean;
};

/** Reads a quoted run starting just after its opening quote; a missing closing quote ends it. */
function readQuoted(text: string, start: number): { value: string; end: number } {
  const close = text.indexOf('"', start);
  const end = close === -1 ? text.length : close;
  return { value: text.slice(start, end), end: end + 1 };
}

/** Reads an unquoted run up to the next space. */
function readBare(text: string, start: number): { value: string; end: number } {
  const match = /\s/.exec(text.slice(start));
  const end = match === null ? text.length : start + match.index;
  return { value: text.slice(start, end), end };
}

/** Reads one token starting at a non-space character. */
function readToken(text: string, start: number): { token: Token; end: number } {
  const isNegated = text[start] === '-';
  const from = isNegated ? start + 1 : start;
  if (text[from] === '"') {
    const quoted = readQuoted(text, from + 1);
    return {
      token: { key: undefined, value: quoted.value, isQuoted: true, isNegated },
      end: quoted.end,
    };
  }
  const bare = readBare(text, from);
  const colon = bare.value.indexOf(':');
  const key = colon > 0 ? bare.value.slice(0, colon) : '';
  if (!KEY.test(key)) {
    return {
      token: { key: undefined, value: bare.value, isQuoted: false, isNegated },
      end: bare.end,
    };
  }
  if (text[from + colon + 1] === '"') {
    const quoted = readQuoted(text, from + colon + 2);
    return { token: { key, value: quoted.value, isQuoted: true, isNegated }, end: quoted.end };
  }
  return {
    token: { key, value: bare.value.slice(colon + 1), isQuoted: false, isNegated },
    end: bare.end,
  };
}

/** Splits a query string into tokens. */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let position = 0;
  while (position < text.length) {
    if (/\s/.test(text[position] ?? '')) {
      position++;
      continue;
    }
    const { token, end } = readToken(text, position);
    tokens.push(token);
    position = end;
  }
  return tokens;
}

/** Turns a token into a term, or undefined for one with nothing in it (a lone `-` or `tag:`). */
function toTerm(token: Token): Term | undefined {
  const value = token.value.trim();
  const { isNegated } = token;
  if (token.key === undefined) {
    if (value === '') {
      return undefined;
    }
    if (token.isQuoted) {
      return { kind: 'phrase', value, isNegated };
    }
    if (value.toLowerCase() === 'unsorted') {
      return { kind: 'filter', key: 'unsorted', value: '', isNegated };
    }
    return { kind: 'word', value, isNegated };
  }
  if (value === '') {
    return undefined;
  }
  const key = token.key.toLowerCase();
  if (isFilterKey(key)) {
    return filterTerm(key, value, isNegated);
  }
  return { kind: 'field', key, value, isNegated };
}

/** `rating:4` or `rating:3+`; anything else after `rating:` is searched for as a word. */
const RATING_VALUE = /^[1-5]\+?$/;

/**
 * Makes a filter term. Sections, slugs and file types are lowercase, so they match any case. A
 * rating that isn't 1 to 5 becomes a word, so no typed query can fail.
 */
export function filterTerm(key: FilterKey, value: string, isNegated = false): Term {
  if (key === 'rating' && !RATING_VALUE.test(value)) {
    return { kind: 'word', value: `rating:${value}`, isNegated };
  }
  const isCaseless = key === 'in' || key === 'sub' || key === 'type';
  return { kind: 'filter', key, value: isCaseless ? value.toLowerCase() : value, isNegated };
}

/** Parses a query string into its terms, in canonical order with repeats removed. */
export function parseQuery(text: string): Query {
  const terms = tokenize(text)
    .map(toTerm)
    .filter((term) => term !== undefined);
  return { terms: canonicalOrder(terms) };
}
