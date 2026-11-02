# 0001: Tool versions at scaffold

Date: 2026-10-31 · PR 1 (scaffold)

## Context

The architecture names the tools but not their versions. The scaffold had to pick majors that
work together today.

## Decision

- **Runtime:** Node 24 LTS in `.nvmrc` (CI and the packaged runtime both read it); `engines` allows
  22.18+ for local development. Fastify 5, Preact 10 with preact-render-to-string 6, TypeBox 0.34
  through `@fastify/type-provider-typebox`.
- **Build and test:** Vite 8 and Vitest 5 (Vitest 3 pulled in a tinypool release with a critical
  advisory). TypeScript 5.9.
- **Lint:** ESLint 9 flat config with typescript-eslint 8, eslint-plugin-jsdoc and
  eslint-plugin-import-x; Stylelint 16 with stylelint-config-standard. ESLint 10 and TypeScript 6
  were left for a later Dependabot PR so plugin compatibility can be checked on its own.
- **Node-prefix rule:** import-x 4 has no rule for the `node:` prefix, so a `no-restricted-syntax`
  selector enforces it.

## Consequences

Dependabot proposes only minor and patch updates (`.github/dependabot.yml` ignores majors). The
next majors — ESLint 10, TypeScript 7, Stylelint 17 — break the current lint and type setup, so
each is a deliberate upgrade PR with its plugins, after 1.0. `@types/node` stays on the runtime's
major (24).
