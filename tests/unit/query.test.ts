import { describe, expect, it } from 'vitest';

import { queryToText, withoutTerm, withTermReplaced } from '#core/query/canonical-query.js';
import { compileQuery } from '#core/query/compile-query.js';
import { filterTerm, parseQuery } from '#core/query/parse-query.js';

describe('parseQuery', () => {
  it('reads filters, fields, phrases, words and negation', () => {
    const query = parseQuery('-type:GIF model:Elena "life drawing" hands agency:example.com');
    expect(query.terms).toEqual([
      { kind: 'filter', key: 'model', value: 'Elena', isNegated: false },
      { kind: 'filter', key: 'type', value: 'gif', isNegated: true },
      { kind: 'field', key: 'agency', value: 'example.com', isNegated: false },
      { kind: 'phrase', value: 'life drawing', isNegated: false },
      { kind: 'word', value: 'hands', isNegated: false },
    ]);
  });

  it('reads quoted values, unsorted, and keys in any script', () => {
    expect(queryToText(parseQuery('collection:"Spring model session" UNSORTED 人物:x'))).toBe(
      'unsorted collection:"Spring model session" 人物:x',
    );
  });

  it('drops empty terms and repeats, and never fails on odd input', () => {
    expect(queryToText(parseQuery('tag: - tag:hands tag:hands "unclosed'))).toBe(
      'tag:hands "unclosed"',
    );
    expect(parseQuery('   ').terms).toEqual([]);
  });

  it('writes one canonical string whatever order the terms came in', () => {
    expect(queryToText(parseQuery('model:Elena tag:hands'))).toBe('tag:hands model:Elena');
    expect(queryToText(parseQuery('tag:hands model:Elena'))).toBe('tag:hands model:Elena');
  });

  it('drops a term or replaces one on the same key', () => {
    const query = parseQuery('in:photos sub:figure tag:hands');
    expect(queryToText(withoutTerm(query, 2))).toBe('in:photos sub:figure');
    expect(queryToText(withTermReplaced(query, filterTerm('sub', 'Hands')))).toBe(
      'in:photos sub:hands tag:hands',
    );
  });
});

describe('compileQuery', () => {
  it('binds every value as a parameter, never in the SQL text', () => {
    const compiled = compileQuery(parseQuery(`tag:"x' OR 1=1 --" rating:3+`));
    expect(compiled.where).not.toContain('OR 1=1');
    expect(compiled.params).toEqual(["x' OR 1=1 --", 'rating', 3]);
  });

  it('negates a term and escapes LIKE wildcards', () => {
    const compiled = compileQuery(parseQuery('-100%_done'));
    expect(compiled.where).toMatch(/^\(NOT \(/);
    expect(compiled.params).toEqual(['%100\\%\\_done%']);
  });

  it('matches everything with no terms', () => {
    expect(compileQuery({ terms: [] })).toEqual({ where: '1 = 1', params: [] });
  });

  it('searches for a rating outside 1 to 5 as a word instead of failing', () => {
    const query = parseQuery('rating:9');
    expect(query.terms).toEqual([{ kind: 'word', value: 'rating:9', isNegated: false }]);
    expect(() => compileQuery(query)).not.toThrow();
  });
});
