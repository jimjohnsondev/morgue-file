// The shape of fixtures/seed.json, the invented tags, collections, models and field values that
// seed-fixtures.ts applies to the fixture archive through the app's own API. Items are named by
// path under the Reference folder, or by a pattern where * matches within one folder name and
// **/ matches any number of folders.
import { readFile } from 'node:fs/promises';

import { type Static, Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

const ItemPatterns = Type.Array(Type.String({ minLength: 1 }), { minItems: 1 });
const FieldValues = Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()]));
const Named = { name: Type.String({ minLength: 1 }), items: ItemPatterns };

/** The TypeBox schema seed.json must match. */
export const SeedSchema = Type.Object({
  subcategories: Type.Array(
    Type.Object({
      section: Type.Union([Type.Literal('photos'), Type.Literal('video'), Type.Literal('library')]),
      name: Type.String({ minLength: 1 }),
      folders: Type.Array(Type.String()),
    }),
  ),
  filedByHand: Type.Array(Type.Object({ subcategory: Type.String(), items: ItemPatterns })),
  picklistChoices: Type.Record(Type.String(), Type.Array(Type.String())),
  itemFieldValues: Type.Array(Type.Object({ items: ItemPatterns, values: FieldValues })),
  modelFields: Type.Array(
    Type.Object({
      key: Type.String(),
      label: Type.String(),
      type: Type.Union(
        ['text', 'longtext', 'link', 'date', 'number', 'picklist'].map((type) =>
          Type.Literal(type),
        ),
      ),
      options: Type.Optional(Type.Array(Type.String())),
    }),
  ),
  models: Type.Array(
    Type.Object({
      name: Type.String({ minLength: 1 }),
      fields: FieldValues,
      tags: Type.Array(Type.String()),
      portrait: Type.String(),
      appearsIn: Type.Array(
        Type.Object({
          items: ItemPatterns,
          pages: Type.Optional(Type.Tuple([Type.Integer(), Type.Integer()])),
        }),
      ),
    }),
  ),
  tags: Type.Array(Type.Object(Named)),
  collections: Type.Array(Type.Object(Named)),
  views: Type.Array(
    Type.Object({
      item: Type.String(),
      viewedAt: Type.String(),
      position: Type.Optional(Type.Number()),
    }),
  ),
});

/** The parsed contents of seed.json. */
export type Seed = Static<typeof SeedSchema>;

/** Reads and checks seed.json, failing with the first schema error. */
export async function loadSeed(seedPath: string): Promise<Seed> {
  const parsed: unknown = JSON.parse(await readFile(seedPath, 'utf8'));
  if (Value.Check(SeedSchema, parsed)) {
    return parsed;
  }
  const firstError = Value.Errors(SeedSchema, parsed).First();
  throw new Error(`${seedPath} ${firstError?.path ?? ''}: ${firstError?.message ?? 'invalid'}`);
}

/** Turns an item pattern into a regular expression over the whole path. */
export function patternToRegExp(pattern: string): RegExp {
  const parts = pattern.split(/(\*\*\/|\*)/).map((part) => {
    if (part === '**/') {
      return '(?:[^/]+/)*';
    }
    if (part === '*') {
      return '[^/]*';
    }
    return part.replaceAll(/[.+?^${}()|[\]\\]/g, '\\$&');
  });
  return new RegExp(`^${parts.join('')}$`);
}

/** The item paths the patterns pick out, in the order of `allPaths`, each once. */
export function matchItems(patterns: readonly string[], allPaths: readonly string[]): string[] {
  const expressions = patterns.map(patternToRegExp);
  return allPaths.filter((itemPath) => expressions.some((expression) => expression.test(itemPath)));
}

/** Patterns that match no item, so a typo in seed.json fails a test instead of seeding nothing. */
export function findUnmatchedPatterns(
  patterns: readonly string[],
  allPaths: readonly string[],
): string[] {
  return patterns.filter((pattern) => matchItems([pattern], allPaths).length === 0);
}
