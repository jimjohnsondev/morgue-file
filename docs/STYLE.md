# Code style

The codebase should read like plain, careful TypeScript written by one person (PRD R32, R33).
Lint enforces every rule it can, so consistency doesn't depend on review alone.
**When short and readable disagree, readable wins.**

## Tools

| Tool       | Setting                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------- |
| Prettier   | printWidth 100, single quotes, semicolons, trailing commas, LF, 2-space indents          |
| TypeScript | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` |
| ESLint     | typescript-eslint strict and stylistic type-checked, jsdoc, import order; zero warnings  |
| Stylelint  | Standard config; colors and sizes only through variables from `src/styles/tokens.css`    |

## Readability limits (lint-enforced)

| Rule                  | Limit                                                                   |
| --------------------- | ----------------------------------------------------------------------- |
| Function length       | 40 lines (80 for Preact view components), excluding blanks and comments |
| File length           | 300 lines                                                               |
| Cyclomatic complexity | 10 per function                                                         |
| Nesting depth         | 3 levels                                                                |
| Parameters            | 3; past that, pass one options object                                   |
| Ternaries             | Never nested                                                            |
| Names                 | No single letters except loop indexes `i`, `j`, `k`                     |
| Doc comments          | Every exported function, type and component: what it's for and why      |

## One way to do each thing

### Modules

Plain functions grouped by feature, named exports, `node:` prefix for built-ins, `#core/...` and
`#server/...` across folders. Never default exports (except tool config files), barrel
`index.ts` files or `require`.

```ts
import path from 'node:path';

import { AppError } from '#core/errors.js';
```

### Functions

`function` declarations for anything named. Arrow functions only as short inline callbacks.
No classes, except `Error` subclasses.

```ts
/** Returns the slug used in URLs for a subcategory name. */
export function slugify(name: string): string {
  return name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
}

const names = items.map((item) => item.name);
```

### Data

`type` aliases for plain objects, `readonly` where possible, string unions for fixed sets.
Never `enum`, `interface` or classes for data.

```ts
/** A file's media section, decided by its kind. */
export type Section = 'photos' | 'video' | 'library';

export type Item = {
  readonly id: number;
  readonly section: Section;
};
```

### Async

`async`/`await`. Wrap a Node callback API once, in core. Never `.then()` chains.

### Errors

Throw an `AppError` with a code; `src/server/error-handler.ts` maps codes to HTTP statuses in one
place. Never return `null` to mean failure; never leave a `catch` block empty (a comment saying why
the error is safe to ignore is the minimum).

```ts
throw new AppError('not-found', `No item ${String(id)}.`);
```

### Missing values

`undefined`, with `?.` and `??`. `null` only where SQLite returns it, inside a repository, which
converts it before returning.

### Loops

`for...of`, `map` and `filter`. No `forEach`. `reduce` only for a simple sum, with an
`eslint-disable-next-line` comment saying so.

### SQL

Prepared statements in `src/core/db/repositories`, one function per query, named for what it
returns (`findItemsByQuery`). Values are always bound parameters. Never SQL elsewhere, ORMs or
query builders.

### Validation

TypeBox schemas on every route, through Fastify's type provider. No hand-written checks of request
shape inside handlers.

### Naming

camelCase for values, PascalCase for types and components, kebab-case file names, verbs for
functions, `is`/`has`/`can` for booleans. Never Hungarian prefixes, or `data`, `info`, `handle`
alone.

### Comments

Why, not what. One header line per file saying what it's for. Never commented-out code or TODOs
without an issue link.

### Client code

Plain DOM APIs, one module per behavior in `src/client/`, hooked to `data-` attributes. No client
frameworks, globals or inline event handlers (the CSP blocks them anyway).

### CSS

Kebab-case class names with BEM-style `__element` and `--modifier`. Every color and size comes from
a `tokens.css` variable. No border radius, transitions, animations, blur or soft shadows.

## Before a PR is opened

- Reread the diff against this file; rewrite anything a newcomer would have to read twice.
- Run the `code-reviewer` agent and fix its blocking findings.
- Formatting changes never share a PR with logic changes.
- Never commit generated or minified code. `package-lock.json` is the one exception.
