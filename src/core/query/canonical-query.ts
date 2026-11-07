// The canonical form of a query: one string per meaning, with its terms in a fixed order. It is
// used in URLs, in the title echo (frame 4) and in the links that drop one filter (frame 4, E2).
import { FILTER_KEYS } from './query-types.js';

import type { Query, Term } from './query-types.js';

/** Where each kind of term sorts: the known filters first, then fields, phrases and words. */
function rankOf(term: Term): number {
  switch (term.kind) {
    case 'filter':
      return FILTER_KEYS.indexOf(term.key);
    case 'field':
      return FILTER_KEYS.length;
    case 'phrase':
      return FILTER_KEYS.length + 1;
    case 'word':
      return FILTER_KEYS.length + 2;
  }
}

/** Quotes a value that holds a space, so it reads back as one term. Quotes inside are dropped. */
function quoteIfNeeded(value: string): string {
  const clean = value.replaceAll('"', '');
  return /\s/.test(clean) ? `"${clean}"` : clean;
}

/** Writes one term as it appears in a query string. */
export function termToText(term: Term): string {
  const sign = term.isNegated ? '-' : '';
  switch (term.kind) {
    case 'filter':
      return term.key === 'unsorted'
        ? `${sign}unsorted`
        : `${sign}${term.key}:${quoteIfNeeded(term.value)}`;
    case 'field':
      return `${sign}${term.key}:${quoteIfNeeded(term.value)}`;
    case 'phrase':
      return `${sign}"${term.value.replaceAll('"', '')}"`;
    case 'word':
      return `${sign}${term.value}`;
  }
}

/**
 * Orders terms canonically: by kind, then key, then text. Words keep the order they were typed
 * in, since the last one matches as a prefix (`hands foresh` is not `foresh hands`). Repeated
 * terms are kept once.
 */
export function canonicalOrder(terms: readonly Term[]): Term[] {
  const sorted = [...terms].sort((left, right) => {
    const byRank = rankOf(left) - rankOf(right);
    if (byRank !== 0 || left.kind === 'word') {
      return byRank;
    }
    return termToText(left).localeCompare(termToText(right));
  });
  const seen = new Set<string>();
  return sorted.filter((term) => {
    const text = termToText(term).toLowerCase();
    if (seen.has(text)) {
      return false;
    }
    seen.add(text);
    return true;
  });
}

/** The canonical query string. */
export function queryToText(query: Query): string {
  return query.terms.map(termToText).join(' ');
}

/** Says whether two terms filter on the same key (two `sub:` terms, say). */
function hasSameKey(left: Term, right: Term): boolean {
  return left.kind === right.kind && 'key' in left && 'key' in right && left.key === right.key;
}

/** The query with one more term. */
export function withTerm(query: Query, term: Term): Query {
  return { terms: canonicalOrder([...query.terms, term]) };
}

/** The query with a term in place of any others on the same key (a new `sub:` for the old). */
export function withTermReplaced(query: Query, term: Term): Query {
  const kept = query.terms.filter((other) => !hasSameKey(other, term));
  return { terms: canonicalOrder([...kept, term]) };
}

/** The query without the term at an index: the target of a removable filter's [x] link. */
export function withoutTerm(query: Query, index: number): Query {
  return { terms: query.terms.filter((_term, termIndex) => termIndex !== index) };
}
