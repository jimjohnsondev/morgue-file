## What this does

<!-- One or two sentences. Title must be a Conventional Commit: feat:, fix:, chore:, docs:, test:, refactor: -->

Build plan row: #
Implements: R

## How it was tested

<!-- Which acceptance tests (named after their PRD rows) cover this. -->

## Checklist

- [ ] Every claimed PRD row has a test named after it, and it fails without the change
- [ ] `npm run check` is clean (format, lint, typecheck, tests)
- [ ] I reread the diff against `docs/STYLE.md` and rewrote anything that reads twice
- [ ] The `code-reviewer` agent approved this branch
- [ ] No real images, videos, PDFs or personal details; test data comes from the fixture generator
- [ ] No new runtime dependency, or an ADR in `docs/decisions/` explains it
- [ ] `docs/ARCHITECTURE.md` still matches what was built
- [ ] No screenshot baselines changed (or the PR is waiting for `baseline-approved`)
- [ ] Formatting-only changes are not mixed with logic changes
