// The full-text part of a query (docs/ARCHITECTURE.md, Search): its words and phrases as FTS5
// MATCH expressions, run against item_search for the results and model_search for the line of
// models above them. Each word or phrase is quoted, so nothing typed is read as FTS5 syntax.
import type { Query, Term } from './query-types.js';

/** The MATCH expression every result must meet, and one per negated word or phrase. */
export type TextMatch = {
  /** Undefined when the query has no words or phrases that aren't negated. */
  readonly match: string | undefined;
  readonly excluded: readonly string[];
};

type TextTerm = Extract<Term, { kind: 'word' | 'phrase' }>;

/** Says whether a term is free text rather than a filter or field. */
export function isTextTerm(term: Term): term is TextTerm {
  return term.kind === 'word' || term.kind === 'phrase';
}

/** One word or phrase as an FTS5 string, its quotes doubled, with `*` to match a prefix. */
function quoted(term: TextTerm, isPrefix: boolean): string {
  const text = `"${term.value.replaceAll('"', '""')}"`;
  return isPrefix ? `${text}*` : text;
}

/**
 * The query's free text as MATCH expressions. Terms are ANDed, as everywhere in the language.
 * The last word that isn't negated matches as a prefix, so results come while it is still being
 * typed; a negated word excludes only itself, never every word it begins.
 */
export function textMatch(query: Query): TextMatch {
  const texts = query.terms.filter(isTextTerm);
  const lastWord = texts.findLast((term) => term.kind === 'word' && !term.isNegated);
  const expressions = texts.map((term) => ({
    term,
    expression: quoted(term, term === lastWord),
  }));
  const kept = expressions.filter(({ term }) => !term.isNegated);
  return {
    match: kept.length === 0 ? undefined : kept.map(({ expression }) => expression).join(' '),
    excluded: expressions.filter(({ term }) => term.isNegated).map(({ expression }) => expression),
  };
}
