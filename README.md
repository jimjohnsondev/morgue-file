# Morgue File

A personal reference archive for painters. Morgue File turns a folder of reference photos,
videos, books and magazines into a tagged, browsable gallery with a profile page for each model,
styled like an early-2000s art site. It runs on your own Windows PC, works offline, and never
changes your files.

> **Status:** under construction. There is no release to download yet. The user sections below
> are filled in by PR 3, when the first Windows zip is built.

## Requirements

64-bit Windows 10 or 11, and Edge or Chrome. Disk space for the app's data folder, which grows
with your archive.

## Install

Written in PR 3.

## First run

Written in PR 3.

## Everyday use

Written as features land.

## Update

Written in PR 3.

## Move or back up

Written in PR 3.

## Uninstall

Written in PR 3.

## Troubleshooting

Written in PR 3.

## For developers

You need Node.js 24 (see `.nvmrc`).

```sh
git clone <this repo>
cd morgue-file
npm ci
npm run dev       # builds, then serves http://127.0.0.1:47613
npm run check     # format, lint, typecheck and tests
```

- `docs/PRD.md` — what the app does, with numbered requirements
- `docs/DESIGN-BRIEF.md` — what it looks like, with the exact design values
- `docs/ARCHITECTURE.md` — how it is built, and the build plan
- `docs/STYLE.md` — how the code is written
- `CLAUDE.md` — instructions for Claude Code, which builds this repo through pull requests

## License

MIT
