# Morgue File — instructions for Claude Code

Morgue File is a personal reference archive for a figurative painter: a Node.js server on
127.0.0.1 that renders an early-2000s gallery site over a folder of photos, videos, books and
magazines on one Windows PC. You build it end to end, one pull request at a time. The owner, Jim,
checks in only at the design gate, when you are stuck, and when 1.0 ships.

## Read these first

| Doc                    | Decides                                                           |
| ---------------------- | ----------------------------------------------------------------- |
| `docs/PRD.md`          | Scope, priorities, acceptance criteria (rows R1–R38)              |
| `docs/DESIGN-BRIEF.md` | Anything visible on screen, then the screens approved at the gate |
| `docs/ARCHITECTURE.md` | How it is built, and the order of the 25 PRs (Build plan)         |
| `docs/STYLE.md`        | How the code is written                                           |

When they disagree, the table above says which wins. If what you build departs from
`docs/ARCHITECTURE.md`, update it in the same PR.

## Hard rules

1. **Branches and PRs only.** Never push to `main`, merge by hand, force-push a shared branch, or
   add the `baseline-approved` label. Auto-merge merges green PRs.
2. **One build-plan row per PR**, in the order of the Build plan in `docs/ARCHITECTURE.md`. Don't
   start the next row while a PR from the previous one is open and red.
3. **PR titles are Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, `test:`,
   `refactor:`). release-please builds versions and the changelog from them.
4. **List the PRD rows a PR implements** in its body (`Implements R10, R15`). Name each acceptance
   test after its row: `it('R18: any Index page renders in under 300 ms', ...)`.
5. **Runtime dependencies** only if `docs/ARCHITECTURE.md` names them. Anything else needs a short
   ADR in `docs/decisions/` in the same PR.
6. **Never commit a real image, video, PDF or personal detail.** The repo is public. All test data
   comes from the fixture generator (`scripts/make-fixtures.ts`, PR 4). Names and counts must match
   the Sample content table in `docs/DESIGN-BRIEF.md`.
7. **Never write to originals.** Only `src/core/archive/originals.ts` touches files under a
   Reference root, read-only, plus `writeInbox()`. Lint enforces the import rule.
8. **Never weaken a gate to get green**: no skipped or `.only` tests, no loosened lint limits, no
   `eslint-disable` without a reason on the same line, no lowered perf thresholds, no screenshot
   updates without the label. If a gate is genuinely wrong, say so in the PR and stop.
9. **Colors and sizes live only in `src/styles/tokens.css`**, copied from the design brief's Fixed
   specs. No rounded corners, blur, soft shadows or transitions anywhere.
10. **No modal dialogs or pop-up windows** (R37). Editing happens inline on the page.

## Commands

```sh
npm ci                 # install
npm run dev            # build, then serve at http://127.0.0.1:47613
npm run check          # format check, lint, typecheck, tests: run before every push
npm run format         # fix formatting (never mix with logic changes in one PR)
npm test               # Vitest unit and integration tests
npm run build          # Vite client bundle + tsc server into dist/
```

Playwright (e2e, visual, perf) arrives in PR 2; its commands will be added here.

## Workflow for each PR

1. Find the next unfinished row in the Build plan (`docs/ARCHITECTURE.md`). Check open PRs first:
   if one is red, fixing it comes before anything new.
2. Branch from `main`: `feat/r18-index-template`, `fix/...`, `chore/...`.
3. Write the acceptance tests for the PRD rows first, named after the rows, then the code.
4. Run `npm run check` until it is clean.
5. Reread your diff against `docs/STYLE.md` and rewrite anything a newcomer would read twice.
6. **Run the `code-reviewer` agent** on the branch and fix every blocking finding. Re-run it until
   it approves.
7. Open the PR with the template filled in and enable auto-merge (`gh pr merge --auto --squash`).
8. If CI fails, read the log, fix and push. After 3 failed attempts on the same problem, stop and
   report it: what failed, what you tried, what you need.

## When to stop and ask Jim

- The design gate (after PR 10): post built frames 1–12 and E1–E6 next to the mocks and wait.
- Anything that needs admin rights, a token or a secret.
- A screenshot baseline must change (he adds `baseline-approved`).
- The docs contradict each other in a way the precedence table doesn't settle.
- The same CI failure after 3 attempts.

## Layout

```
src/server/   Fastify app, routes, security hooks, Preact SSR views (server-only, never hydrated)
src/core/     db, query language, field system, archive access, indexer, jobs, ingest, backup
src/client/   Vite entries: one plain-DOM module per behavior, hooked to data- attributes
src/styles/   tokens.css (design values), base.css, templates.css, banner.svg
tests/        unit/, integration/ (Vitest); e2e/, visual/, perf/, package/ (Playwright, from PR 2)
docs/         PRD, design brief, architecture, style guide, decisions/
```

Imports across folders use `#core/...` and `#server/...` aliases with a `.js` extension.
