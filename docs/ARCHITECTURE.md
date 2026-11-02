# Morgue File — Technical Design

Oct 31, 2026 · Jim Johnson

Repo copy of the project technical design, kept in step with the code (agent rule 6). Live doc with the rendered architecture diagram: https://claude.ai/artifact/Qmz3KrfxzdhBuQbezh3mE9

## Summary

Morgue File is one Node.js process that serves server-rendered pages on 127.0.0.1 and keeps all metadata in a SQLite database with full-text search. It only reads files in the Reference folder; the Inbox is the one place it writes. This doc is Claude Code's build guide. It covers how to build what the PRD (`docs/PRD.md`) specifies and the design brief (`docs/DESIGN-BRIEF.md`) shows, and in what order.

| When the docs disagree about           | This one wins                                       |
| -------------------------------------- | --------------------------------------------------- |
| Scope, priorities, acceptance criteria | PRD                                                 |
| Anything visible on screen             | Design brief, then the screens approved at the gate |
| How it is built                        | This doc                                            |

**Rules for Claude Code**

1. Work on a branch and open a PR. Never push to main, merge by hand, or apply the `baseline-approved` label.
2. List the PRD rows a PR implements in its body (`Implements R10, R15`). Name each acceptance test after its row (`R18: any Index page renders in under 300 ms`).
3. Write PR titles as Conventional Commits (`feat:`, `fix:`, `chore:`). release-please builds versions and the changelog from them.
4. Add a runtime dependency only if this doc names it. Anything else needs a short ADR in `docs/decisions/` in the same PR.
5. Never commit a real image, video, PDF or personal detail. All test data comes from the fixture generator.
6. If the build departs from this doc, update `docs/ARCHITECTURE.md` (this file) in the same PR.
7. Follow docs/STYLE.md (see Code style). When short and readable disagree, write the readable version.

## Architecture

Morgue File runs as one Node.js process on the PC. Pages are rendered on the server, and slow work (thumbnails, PDF covers, hashing) runs in workers outside the request path, so a page never waits on it.

_[Diagram: one process, six core parts (routes and templates, query engine, field system, ingest, indexer, job queue with workers), three stores (library.db, the thumbnail cache, the Reference folder with its Inbox).]_

Routes call the query engine, field system and ingest directly. The indexer and job queue start at launch and run in the background. Inside the Reference folder, the app writes only to the Inbox.

## Repository layout

One repo and one package. Server, core logic and browser code sit in separate folders, so the rule that only one module may touch originals can be enforced by lint.

```
morgue-file/
  README.md           user manual and developer quick start (also shipped as README.html)
  CLAUDE.md           instructions for Claude Code
  .claude/agents/     code-reviewer.md, the review agent every PR runs before opening
  .github/
    workflows/        ci.yml, pr-checks.yml, release.yml, build.yml, update-baselines.yml, dependabot-automerge.yml
    actions/          setup-playwright/ (shared steps for the Playwright jobs)
    dependabot.yml
    pull_request_template.md
  docs/
    ARCHITECTURE.md   this doc
    PRD.md            repo copy of the PRD
    DESIGN-BRIEF.md   repo copy of the design brief
    STYLE.md          the code style guide (see Code style)
    decisions/        one short ADR per departure from this doc
  src/
    server/
      main.ts         starts the server
      launcher.ts     shortcut entry: health check, start or reuse, open the browser
      app.ts          Fastify instance, plugins, security hooks
      config.ts       port, data folder, settings.json; every path resolved from the app folder
      assets.ts       reads Vite's manifest; serves the hashed client files
      error-handler.ts maps AppError codes to HTTP statuses
      security/       host check, origin and token check, CSP
      routes/         pages/, api/, media.ts, events.ts (SSE), healthz.ts, assets.ts, setup.ts
      views/          Preact SSR: layout/, templates/ (Index, Item, ModelProfile), parts/
    core/
      errors.ts       AppError and its codes
      db/             connection, migrations/NNN_name.sql, repositories
      query/          lexer, parser, AST, compiler to SQL, canonical form
      fields/         the shared field system for items and models
      archive/        originals.ts (only fs access to roots), classify.ts, pagefolder.ts
      indexer/        scanner.ts, watcher.ts, reconcile.ts, moves.ts, roots.ts
      jobs/           queue.ts, workers/ (thumb-image, thumb-pdf, thumb-video, hash)
      ingest/         ingest.ts, fetch-url.ts
      backup/         zip export and restore
    client/           Vite entries: main, selection, dropzone, keyboard, viewer-image, viewer-video, reader, compare
    styles/           tokens.css (approved design values), base.css, templates.css, banner.svg
  scripts/            make-fixtures.ts, seed-fixtures.ts, make-perf-db.ts, package-win.ts, setup-repo.ts, check-readme.ts
  fixtures/seed.json  invented tags, collections, models, field values
  tests/              unit/, integration/, e2e/, visual/ (+ __screenshots__/), perf/, migrations/, package/
  .nvmrc  .editorconfig  .prettierrc.json  package.json  tsconfig.json  tsconfig.build.json  vite.config.ts  vitest.config.ts
  playwright.config.ts  eslint.config.js  stylelint.config.js  release-please-config.json  .release-please-manifest.json
```

- The generated fixture archive, `dist/`, `node_modules/` and any local `data\` folder are git-ignored.
- `tokens.css` is the only file allowed to hold colors, font sizes and thumbnail sizes. Stylelint fails any hard-coded color elsewhere.
- Cross-folder imports use the `#core/*` and `#server/*` aliases from `package.json` `imports`, written with a `.js` extension. TypeScript resolves them to `src/` through the `types` condition, Node resolves them to `dist/` at run time, and Vitest maps them to `src/` in `vitest.config.ts`.

## Data model

All metadata lives in `library.db`, opened with better-sqlite3 in WAL mode. Originals are stored as a root plus a relative path, so a changed drive letter is one settings edit, not a re-index.

| Table                                  | Key columns                                                                                                                                                                                                  | Notes                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| roots                                  | id, path, label, status, last\_scan\_at                                                                                                                                                                      | The Reference folder is root 1; status is online or offline                                                                                      |
| items                                  | id, root\_id, rel\_path, kind, section, subcategory\_id, subcategory\_manual, size, mtime, partial\_hash, full\_hash, width, height, duration\_ms, fps, page\_count, added\_at, missing\_since, thumb\_state | Unique on (root\_id, rel\_path). Kind is image, video, pdf, cbz or pagefolder; section follows from kind                                         |
| subcategories                          | id, section, name, slug, position, thumb\_shape, group\_by (JSON)                                                                                                                                            | Seeded with Books and Magazines. Unsorted is subcategory\_id NULL, not a row                                                                     |
| folder\_mappings                       | id, root\_id, rel\_prefix, subcategory\_id                                                                                                                                                                   | Longest matching prefix wins                                                                                                                     |
| fields                                 | id, entity, key, label, type, options (JSON), scope, position, builtin, removed\_at                                                                                                                          | entity is item or model. Types: text, longtext, link, date, number, picklist. A removed field keeps its values for 30 days, then is purged (R38) |
| field\_values                          | entity, entity\_id, field\_id, value\_text, value\_num                                                                                                                                                       | Dates as ISO text; numbers and ratings in value\_num                                                                                             |
| tags, item\_tags                       | tags.name unique, case-insensitive                                                                                                                                                                           | Free-form item tags                                                                                                                              |
| collections, collection\_items         | collection\_id, item\_id, position, added\_at                                                                                                                                                                | Flat; an item can sit in many                                                                                                                    |
| models, model\_tags, model\_tag\_links | models.slug, portrait\_item\_id                                                                                                                                                                              | Model tags are a separate namespace from item tags                                                                                               |
| item\_models                           | item\_id, model\_id, page\_from, page\_to                                                                                                                                                                    | NULL page range means the whole item (R17)                                                                                                       |
| saved\_searches                        | id, name, q                                                                                                                                                                                                  | P2                                                                                                                                               |
| item\_views                            | item\_id, viewed\_at, position                                                                                                                                                                               | Viewing history for Home's first strip; position is the video time or page reached; the last 200 kept (R35)                                      |
| jobs                                   | id, type, item\_id, priority, state, attempts, last\_error, updated\_at                                                                                                                                      | Thumbnail, cover and hash work                                                                                                                   |
| settings                               | key, value                                                                                                                                                                                                   | Thumbnails per page and size, compare-board layout                                                                                               |
| item\_search (FTS5)                    | rowid = item id                                                                                                                                                                                              | Filename words, tags, collections, subcategory, notes, model names                                                                               |
| model\_search (FTS5)                   | rowid = model id                                                                                                                                                                                             | Model field values and model tags                                                                                                                |

**Field system.** Seeded fields for items: notes (long text), source\_url (link) and rating (number, 1–5). Magazines adds magazine\_title (pick-list) and issue\_date (date), with scope set to that subcategory. Models start with name (text) and bio (long text); the fixture adds the brief's agency link, first session, sessions and a demo pose-length pick-list. Templates render whatever the fields table holds, so adding, renaming or removing a field never needs code (R11, R14). Model fields are P0, and item fields reuse the same code.

**Search tables.** FTS5 uses the unicode61 tokenizer with remove\_diacritics 2 and prefix indexes of 2 and 3 characters. Filenames are split on `_`, `-`, `.` and camelCase before indexing, so `seated_backlit_017` matches "backlit". App code rewrites an item's search row in the same transaction as any change to its tags, collections, fields or models; there are no triggers across joins.

**Indexes.** items (section, subcategory\_id, added\_at DESC, id); item\_tags (tag\_id, item\_id); item\_models (model\_id, item\_id); field\_values (field\_id, value\_num, entity\_id); collection\_items (collection\_id, position).

**Connections and migrations.**

- PRAGMAs: journal\_mode WAL, synchronous NORMAL, foreign\_keys ON, busy\_timeout 5000.
- One write connection on the main thread. Worker threads never write to the database; they post results back.
- Migrations are numbered SQL files applied at startup in one transaction. If any are pending, `library.db` is first copied to `backups\library-<version>-<timestamp>.db`, keeping the last 5 copies.
- Each migration is tested against the fixture database of every released version.

## Indexing and file watching

The server starts answering before indexing begins, then indexes in the background. All indexing work is recorded in `library.db`, so a restart resumes where it stopped. This is how the first index of about 1 TB is browsable within the first minute.

1. **Startup:** open the database, run migrations, start listening, then begin a reconcile scan of each online root.
2. **Scan:** stream directories with `fs.opendir` and compare each file's path, size and mtime with `items`, 500 rows per transaction. A new file gets an item row and a thumbnail job. A changed file is updated and its thumbnail requeued. A file that wasn't seen gets `missing_since` set; items are never deleted.
3. **Watch:** run chokidar on each root with `ignoreInitial` (the scan covers startup) and a 1 s `awaitWriteFinish`. Every event runs the same reconcile for that one path; R1 allows 5 s.
4. **Moves:** if a new path matches a missing item on size and partial hash, the item is re-pointed and keeps its tags, collections, fields and models. The missing item must be from the same scan or the last 10 minutes. The partial hash is SHA-256 over the size and the first, middle and last 64 KiB.
5. **Missing items:** they keep their cached thumbnail and show state E4 in the viewer. They are purged only by hand, from Settings.

| File                                                                                    | Section and kind                                          |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| .jpg .jpeg .png .webp .gif (P1 adds .heic .tif .tiff .psd)                              | Photos, image                                             |
| .mp4 .mov (P1 adds .webm)                                                               | Video, video                                              |
| .pdf / .cbz                                                                             | Library, pdf / cbz                                        |
| A folder with no subfolders and 2+ files, every file an image with a number in its name | Library, pagefolder; its images are not indexed as photos |
| Anything else                                                                           | Ignored and counted in the scan log                       |

**Subcategories.** A new item takes the subcategory of the longest folder mapping that matches its path, or none (Unsorted). Filing an item by hand sets `subcategory_manual`, so later scans leave it alone.

**Offline roots.** The root path is checked before each scan, and every 30 s while offline. If it's missing, the root is marked offline, the watcher stops, banner E3 shows, and no items are marked missing. When the path returns, a rescan runs. A new drive letter is fixed by editing the root path in Settings; relative paths don't change.

**Job queue.**

- Jobs run by priority, then newest first: 0 for thumbnails requested by the page being viewed, 1 for ingested files, 2 for background work.
- Image and PDF jobs run on a piscina worker pool sized max(1, cores ÷ 2). Video frames use at most 2 ffmpeg processes.
- A failed job is retried 3 times, then marked failed; the error shows on the item page.
- Progress (E5) streams to pages over SSE at `/events`, with pause and resume.

## Thumbnails and media

Each thumbnail is a WebP made once at twice its display size and stored by item id. Originals are streamed to the browser untouched, with HTTP Range support.

| Kind       | Thumbnail                                                                                            | Viewer gets                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| image      | sharp: EXIF rotate, square crop with `position: attention`                                           | `/media/original/<id>`                                        |
| video      | ffprobe for duration, fps and size; ffmpeg grabs a frame at 10% of the duration; sharp crops it      | `/media/original/<id>` with Range, in a `<video>` element     |
| pdf        | pdf.js (legacy build) with @napi-rs/canvas renders page 1 in a worker; pdf.js also gives page\_count | pdf.js in the browser loads `/media/original/<id>` with Range |
| cbz        | yauzl reads the first image entry in name order                                                      | `/media/page/<id>/<n>` streams entry n                        |
| pagefolder | First file in numeric order                                                                          | `/media/page/<id>/<n>` streams file n                         |

- **Sizes:** square thumbnails at 240, 320 and 480 px (for Small 120, Medium 160 and Large 240) and Library covers at 320×464. The default size is made by the queue; the others are made the first time they're requested.
- **Cache:** files live at `<data folder>\thumbs\<id mod 256, hex>\<id>-<size>.webp` and are served `immutable` with a version parameter. If a thumbnail is missing, the server returns a gray placeholder and queues a priority-0 job; the page retries that image a few times.
- **HEIC (P1):** sharp's prebuilt binaries can't decode HEVC, so ffmpeg extracts a JPEG for the thumbnail and a full-size viewer copy, both stored in the cache. TIFF goes through sharp. PSD previews read the embedded composite with ag-psd; spike this in PR 20.
- **Unplayable video:** Chromium can't decode some codecs (HEVC, ProRes in MOV). For those, the player slot shows the poster frame and a one-line note. There's no transcoding in v1.
- **Video tools (P1):** frame-step uses `requestVideoFrameCallback` with a step of 1 / fps from ffprobe. Loop range sets in and out points on the player.
- **Page reader:** one reader handles PDF, CBZ and page folders, with single or spread view, a thumbnail strip and jump-to-page. For PDFs it renders only visible pages plus one ahead, so a 300-page PDF shows page 1 in under 2 s (R21).

## Server, routes and templates

Every page is plain HTML rendered on the server from one of three templates. Every list in the app is a Query shown by the Index template, so paging, Prev/Next and filters behave the same everywhere.

**Stack.** Fastify 5 serves the app. Pages are Preact components rendered with preact-render-to-string; they are server-only, never hydrated, and escape output by default. Vite builds the client TypeScript entries and one CSS bundle with hashed names, and the server reads Vite's manifest to link them. Pages work as links and forms with JavaScript off, except drag-and-drop, multi-select and the viewers.

| URL                                                                        | Renders                                                  | Query or notes                                                                                                                   |
| -------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                                        | Home (frame 12), a stack of Model profile preview strips | Recently viewed, recently added, Unsorted, collections and random picks, plus archive counts (R34, R35)                          |
| `/photos`, `/video`, `/library`                                            | Index                                                    | `in:<section>`                                                                                                                   |
| `/photos/figure`, `/library/books`                                         | Index                                                    | `sub:<slug>`                                                                                                                     |
| `/library/magazines`                                                       | Index, grouped                                           | One entry per magazine\_title                                                                                                    |
| `/library/magazines/<title>`                                               | Index, grouped                                           | That title's issues by year of issue\_date, newest first (frame 3)                                                               |
| `/collections`, `/collections/<id>`                                        | Index                                                    | The list of collections, then `collection:<id>`                                                                                  |
| `/tags/<name>`                                                             | Index                                                    | `tag:<name>`                                                                                                                     |
| `/unsorted`                                                                | Index                                                    | `unsorted`; E1 when empty                                                                                                        |
| `/search?q=`                                                               | Index                                                    | The parsed q (frame 4, E2)                                                                                                       |
| `/models`, `/models/<slug>`                                                | Index, Model profile                                     | Frame 10                                                                                                                         |
| `/item/<id>?from=<q>`                                                      | Item                                                     | from is the Index query it came from; it drives Prev/Next and "3 of 1,236 in Figure"                                             |
| `/settings/...`                                                            | Template parts                                           | Settings (frame 15): fields, subcategories, folder mappings, roots, backup (R36). Edit forms such as frame 14 use the same parts |
| `/media/thumb/<id>/<size>`, `/media/original/<id>`, `/media/page/<id>/<n>` | Bytes                                                    | Ids only, never paths; Range supported                                                                                           |
| `/assets/<name>`                                                           | Bytes                                                    | Vite's hashed CSS and JS, cached immutable                                                                                       |
| `POST /api/...`                                                            | JSON                                                     | Tag, untag, file, collect, link model, edit fields, ingest                                                                       |
| `GET /events`                                                              | SSE                                                      | Indexing progress, root online or offline                                                                                        |
| `GET /healthz`                                                             | JSON                                                     | `{app: "morgue-file", version}` for the launcher                                                                                 |

**Paging and Prev/Next.**

- Page n is `LIMIT per_page OFFSET (n − 1) × per_page` over the compiled query, ordered by (sort key, id).
- The total comes from `COUNT(*)` on the same query, cached by canonical q until the next write.
- Prev/Next are keyset lookups on (sort key, id) with `LIMIT 1`. The "3 of 1,236" position is a count of rows before the current item.

**Selection and bulk actions.** On an Index page, click, Ctrl-click and Shift-click select items, and Ctrl+A selects the page. A "select all 4,312 results" link selects the whole query. A bulk action sends either ids or the query and runs in one transaction, which meets R10 and R15 (200 items in one action). Every bulk action lives in the action panel above the grid (frame 13); nothing opens a dialog (R37).

**Ingest (R2).**

- Dragging over any page shows the drop outline (E6).
- On drop or paste, any files go to `POST /api/ingest` as multipart. An image dragged from a browser tab sends its file if there is one, and takes source\_url from `text/uri-list` or the `img src` in `text/html`.
- If a drag carries only a URL, the server fetches it, with the limits in Security.
- Files are saved to `Inbox\YYYY-MM\<clean name>`, with " (2)" added on a name clash. They are indexed straight away, and the response returns the item id for the "Saved to Unsorted" notice.

**Keys.** ← and → move to Prev and Next. V toggles viewing mode and Esc leaves it (the final key is set at the design gate). + and − zoom, 0 fits. Comma and period step frames, and \[ and \] set the loop range. Ctrl+S saves an edit form.

**Compare board (P1).** It opens with `window.open('/compare', 'morgue-compare')`, and its layout is saved in `settings` so it survives restarts.

## Search

The search box, the filter bar and every Index URL share one query language. It is parsed once into an AST and compiled into parameterized SQL, so there's one code path to test and to make fast.

| Term                | Meaning                                            | Example                             |
| ------------------- | -------------------------------------------------- | ----------------------------------- |
| words               | Full-text match; the last word matches as a prefix | `hands foresh`                      |
| "phrase"            | Exact phrase                                       | `"life drawing"`                    |
| tag:x               | Has this item tag                                  | `tag:hands`, `tag:back-lit`         |
| model:x             | Linked to a model whose name starts with x         | `model:Elena`                       |
| collection:x        | In this collection                                 | `collection:"Spring model session"` |
| in:x, sub:x         | Section, subcategory                               | `in:photos sub:figure`              |
| type:x              | File kind or extension                             | `type:pdf`                          |
| rating:n, rating:n+ | Rating equal to, or at least, n                    | `rating:3+`                         |
| key:x               | Any user-defined field, by its key                 | `agency:example.com`                |
| unsorted            | Has no subcategory                                 | `unsorted`                          |
| -term               | Negates any term                                   | `-tag:drapery`                      |

- Terms are ANDed together; v1 has no OR.
- Values are always bound as SQL parameters, never pasted into SQL text.
- Each query has one canonical q string with its terms in a fixed order. It's used in URLs, in the title echo (frame 4), in the removable filter links, which are q minus one term (frame 4 and E2), and as the count-cache key.
- Free text also searches `model_search`. Matching models are listed as one line of links above the item results.

**Meeting 200 ms at 50,000 items (R24).** Filters compile to joins on indexed columns, and FTS runs only when there's free text. Paging happens before display data is joined in. The perf suite runs 20 representative queries against a generated 50,000-item database on the CI runner. It fails if p95 goes over 200 ms, or over 300 ms for a full Index page render (R18). Snapshot tests of `EXPLAIN QUERY PLAN` catch a lost index before the timings do.

## Security

Only this PC's browser can reach the server, and only Morgue File's own pages can act on it (R27). The archive is never written to except through the Inbox.

| Threat                                             | Control                                                                                                                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Another device on the network                      | Listen on 127.0.0.1 only, never 0.0.0.0 or ::                                                                                                                                                                                        |
| DNS rebinding from a website                       | Reject with 403 any Host other than `127.0.0.1:<port>` or `localhost:<port>`                                                                                                                                                         |
| A foreign page sending requests or embedding media | Reject requests with `Sec-Fetch-Site: cross-site`. POSTs also need Origin to match and an `X-Morgue-Token` header holding a random per-launch token from a meta tag. No CORS headers are sent, so other origins can't read responses |
| Path traversal                                     | Routes take item ids. `originals.ts` resolves root plus rel\_path and refuses anything outside the root                                                                                                                              |
| Markup injected through filenames, notes or URLs   | Templates escape by default. CSP: `default-src 'self'`, no inline script, images and media from `'self'` and `blob:`                                                                                                                 |
| Server-side fetch for URL drops                    | http and https only. The resolved address must not be loopback, private or link-local. 200 MB cap; image and video content types only                                                                                                |
| Writes to originals                                | `originals.ts` is the only module allowed to import `node:fs` for root paths (ESLint `no-restricted-imports`). It opens files read-only and exposes one write, `writeInbox()`                                                        |

As built in the scaffold: `src/server/security/security-hooks.ts` runs the Host, Sec-Fetch-Site, Origin and token checks in one `onRequest` hook and sets the CSP, `nosniff` and `no-referrer` headers on every response, refusals included. The `no-restricted-imports` rule also exempts the few server files that read the app's own folders (`assets.ts`, `config.ts`, `main.ts`), plus `core/db` and `core/jobs`, which manage the data folder.

**Tests.** Unit tests cover the Host, origin and token checks. An e2e test serves a page from a second origin and checks that its requests are refused. The e2e suite hashes every fixture original before it starts and again when it ends, and fails on any change (R3).

## Testing

Every PRD acceptance line becomes an automated test. Every test runs on generated data that matches the design brief's sample content exactly.

| Layer         | Tool                                                             | Runs              | Covers                                                                                                   |
| ------------- | ---------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------- |
| Unit          | Vitest                                                           | Every PR          | Query parser and compiler, classification, page-folder rule, move matching, field types, security checks |
| Integration   | Vitest, Fastify `inject`, temp SQLite                            | Every PR          | Routes, bulk actions, migrations, ingest, the watcher on a temp folder (R1, 5 s)                         |
| End to end    | Playwright in Chromium, the real server on the fixture archive   | Every PR, Windows | PRD use cases 1–7 and every P0 acceptance line                                                           |
| Visual        | Playwright `toHaveScreenshot`                                    | Every PR, Windows | Frames 1–15 and E1–E6 against the approved baseline                                                      |
| Performance   | Timed queries and page loads on a synthetic 50,000-item database | Every PR, Windows | R18, R21, R24, launch and bulk-import targets                                                            |
| Package smoke | The built zip                                                    | Each release      | The README's Install and First run steps from a path with spaces, then `/healthz` and an Index page      |

**Fixture archive.**

- `scripts/make-fixtures.ts` uses a seeded random generator, so its output is the same byte for byte on every run.
- Images are flat-shaded figures and color fields drawn with sharp. Frame 5's `seated_backlit_017.jpg` is made at its full 4032×3024.
- Videos are 2-second ffmpeg test clips, and PDFs are lorem pages built with pdf-lib. The set also includes CBZ files and page folders.
- `fixtures/seed.json` applies tags, collections, models and field values through the app's own API, so seeding exercises real code.
- Counts match the brief: 4,312 images, 186 videos, 74 publications and 38 collections (4 named, the rest numbered). Elena Varga appears in 212 photos and 4 Library items.
- CI caches the output, keyed by a hash of the generator and the seed.

**Stable screenshots.** The viewport is 2560×1440 at device scale 1, and the clock is frozen at 31 Oct 2026. Only system fonts are used. Tests start after every thumbnail exists, then wait for `document.fonts.ready` and for every image to finish loading. The caret is hidden.

**Baseline updates.**

- Baselines are only ever generated on the CI Windows runner, by `update-baselines.yml`, which commits the PNGs to the PR's branch.
- A required check, `baseline-guard`, fails if anything under `tests/visual/__screenshots__/` changed, unless Jim has added the `baseline-approved` label to the PR.
- The first baseline is created at the design gate.

## CI and release

A merged PR becomes a downloadable Windows zip with no human step. The only manual work is a one-time setup in Phase 0: a token and the branch rules.

| Workflow                 | Trigger                                         | What it does                                                                                                                              |
| ------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| ci.yml                   | Every pull request                              | Jobs `pr-title`, `lint-typecheck`, `unit`, `e2e`, `visual`, `perf` and `baseline-guard`, on the Windows runner (`pr-title` runs on Linux) |
| release.yml              | Push to main                                    | Runs release-please with `RELEASE_TOKEN` and turns on auto-merge for its release PR. When a release is created, it calls build.yml        |
| build.yml                | Called by release.yml, or run by hand for a tag | Build, package, smoke test, then attach the zip and its SHA-256 to the GitHub Release                                                     |
| update-baselines.yml     | Run by hand on a branch                         | Regenerates the screenshots on the Windows runner and commits them                                                                        |
| dependabot-automerge.yml | Dependabot PRs                                  | Turns on auto-merge for patch and minor updates                                                                                           |

As built in PR 2:

- The jobs are split across two workflows. `ci.yml` runs `lint-typecheck`, `unit`, `e2e`, `visual` and `perf` on `windows-2025` for every push to a PR. `pr-checks.yml` runs `pr-title` and `baseline-guard` on Linux and also re-runs when the title or labels change. Keeping them apart means adding a label never re-runs, or skips, the build and test jobs; GitHub can count a skipped required job as passing.
- `visual` and `perf` run with `--pass-with-no-tests` until their first tests land in PR 7.
- The Playwright jobs share a composite action, `.github/actions/setup-playwright`: Node from `.nvmrc`, `npm ci`, a cached Chromium, then `npm run build`. Tests run the built server on port 47690.
- `update-baselines.yml` checks out and pushes with `RELEASE_TOKEN`, because a push made with `GITHUB_TOKEN` wouldn't start CI on the new commit. It refuses to run on `main`.
- `scripts/setup-repo.ts` runs with plain `node` (Node strips the types itself), so it needs no extra dependency. It also creates the `baseline-approved` label and reports whether `RELEASE_TOKEN` is still missing.

**Why this differs from the PRD.** The PRD has build.yml trigger on `v*` tags. But tags and PRs created with the default `GITHUB_TOKEN` don't start other workflows, so release.yml calls build.yml directly. The release PR is opened with `RELEASE_TOKEN`, a fine-grained token with contents and pull-request write access to this repo. Using that token means CI runs on the release PR, so it can auto-merge. To reach 1.0.0, merge a commit with the footer `Release-As: 1.0.0`.

**One-time repo setup.** `scripts/setup-repo.ts` applies these through `gh api`. Jim runs it once with admin rights and creates the token by hand.

- A ruleset on main: PRs required; the ci.yml jobs as required checks; squash merges only; linear history; no force pushes or deletion; no bypass list.
- Allow auto-merge, and delete branches on merge.
- Add the `RELEASE_TOKEN` secret.
- Dependabot checks npm and GitHub Actions weekly, with minor and patch updates grouped.

**Packaging (build.yml on the Windows runner).**

1. `npm ci`, then `npm run build` (Vite for the client, tsc for the server, into `dist/`), then `npm prune --omit=dev`.
2. Download the Node win-x64 zip for the version in `.nvmrc` and verify it against `SHASUMS256.txt`. CI uses the same version, so the better-sqlite3, sharp and @napi-rs/canvas prebuilds match.
3. Copy `ffmpeg.exe` and `ffprobe.exe` from pinned npm packages into `bin\`, with their license files.
4. Assemble and zip `MorgueFile-<version>-win-x64.zip`, then run the smoke test.

```
MorgueFile/
  Morgue File.cmd         runs node\node.exe app\dist\server\launcher.js
  Install shortcuts.cmd   optional Desktop and Start menu shortcuts, no admin needed
  README.html             setup instructions, rendered from README.md at build time
  node\   app\   bin\   LICENSES\
  morgue-file.json        written by setup: where the data folder is; never in the zip
  data\                   made by setup when data is kept with the app; never in the zip
```

**Launcher.**

- The shortcut runs `Morgue File.cmd` minimized, and the launcher calls `/healthz` on the saved port (47613 by default).
- If Morgue File answers, the launcher opens a new browser tab and exits.
- Otherwise it starts the server in the same process and opens `http://127.0.0.1:47613/` in the default browser once it's listening.
- The minimized window, titled "Morgue File server", is the sign that it's running; closing it stops the server.
- If another program holds the port, the launcher moves to the next free one (see Portable install). Nothing is added to Windows startup.

## Portable install and README

Morgue File is one folder: unzip it anywhere, double-click it, then pick the Reference folder and where to keep the app's data. By default the data sits beside the app, so the app, its data and its instructions travel together (R29–R31).

**Where data lives.**

- Setup offers two places for the data (database, thumbnails, backups, settings). **Keep data with the app** is the default and puts it in `data\` next to `app\`. **Use a folder I choose** takes any writable path, pre-filled with `%LOCALAPPDATA%\MorgueFile`.
- The choice is saved in `morgue-file.json` beside `Morgue File.cmd`, as `{ "dataDir": "data" }` or an absolute path. The release zip never includes this file, so updates keep the choice.
- `config.ts` works out every other path from that file and the app folder, never from the current directory or the registry.
- If a chosen folder already holds a `library.db`, setup offers to use it. That's how a reinstalled app reconnects to its existing library.
- If the data folder is missing at launch (an unplugged drive, say), the browser opens a page to point to it again or start over. Nothing is overwritten.
- Nothing is written outside the app folder and the data folder: no registry keys, services or startup entries. The optional shortcuts are the one exception.

**Staying portable.**

- If the Reference folder is on the same drive as the app, its path is stored relative to the app folder, so a USB drive works under any drive letter. Otherwise the path is absolute, and a missing folder shows E3 with a link to point it somewhere else.
- Paths with spaces and non-ASCII characters work. CI runs the package test from `C:\Temp\Morgue File tést\`.
- A lock file in the data folder stops two copies from sharing one database. A second launch just opens a tab.
- If port 47613 is in use, the launcher tries each port up to 47622 and saves the one it got in `settings.json` in the data folder.

**First run (R30).**

1. Double-click `Morgue File.cmd` or a shortcut. The browser opens to `/setup`.
2. **Reference folder:** one path field, pre-filled with `E:\Reference` if that folder exists, with a Check button. Check confirms the folder exists and can be read, and shows how many files it found at the top level. A missing or unreadable path is refused with a plain-language reason.
3. **Where to keep data:** two choices, Keep data with the app (selected by default) or Use a folder I choose, which has its own path field and Check button. Check confirms the app can create and write a test file there, and says if it found an existing library.
4. Save writes `morgue-file.json`, creates the data folder and `Inbox\` in the Reference folder, starts indexing, and opens Home with the E5 progress bar.

Both choices can be changed later in Settings. Move data copies everything to the new place, checks the copy, switches `morgue-file.json` over, and only then offers to delete the old copy. The setup page is built from template parts, and its screenshot baselines (one per data choice) are approved like any other.

**Update, move, uninstall.**

- **Update:** close the "Morgue File server" window and unzip the new release over the old folder. Neither `morgue-file.json` nor `data\` is in the zip, so the choice and the data stay untouched. Migrations back up the database on first launch.
- **Move or back up:** with the default, copy or move the whole folder. With a chosen data folder, the app folder can move freely, and Settings → Move data moves the data. Backup and restore (R26) covers the database alone.
- **Uninstall:** delete the app folder, any shortcuts, and the chosen data folder if there is one. Originals are never touched.

**README (R31).** `README.md` at the repo root is both the GitHub front page and the user manual. The build renders it to `README.html` in the zip, so it opens in any browser. It's written for someone who has never used a command line, with numbered steps and one action per step.

| Section         | Covers                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| What it is      | One paragraph and a screenshot taken from the approved baseline                                           |
| Requirements    | 64-bit Windows 10 or 11, Edge or Chrome, and disk space for the data folder, which grows with the archive |
| Install         | Download the zip from Releases, Unblock it, unzip it anywhere, optionally run Install shortcuts           |
| First run       | Choosing the Reference folder and where to keep data, and what the first index looks like                 |
| Everyday use    | Adding files, the keys, where Inbox files go                                                              |
| Update          | The steps above                                                                                           |
| Move or back up | The steps above, plus backup and restore                                                                  |
| Uninstall       | The steps above                                                                                           |
| Troubleshooting | Port in use, drive offline, Windows blocking the zip, a video that won't play                             |
| For developers  | Clone, `npm ci`, `npm run dev`, running the tests, links to ARCHITECTURE.md and STYLE.md                  |

**Keeping it true.**

- `scripts/check-readme.ts` runs in CI and fails if any heading above is missing.
- The package test in build.yml performs the README's Install and First run steps in order on a clean runner: unzip, launch, set the Reference folder to the fixture archive, run once with each data choice, wait for the index, open an Index page.
- A PR that changes those steps changes the test in the same PR.

## Code style

The codebase should read like plain, careful TypeScript written by one person. That comes from one formatter, one lint configuration, and one written-down way of doing each common thing (R32, R33). `docs/STYLE.md` holds the rules with a short example of each. Lint enforces every rule it can, so consistency doesn't depend on review alone. When short and readable disagree, readable wins.

| Tool       | Setting                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prettier   | printWidth 100, single quotes, semicolons, trailing commas. `.editorconfig` sets LF line endings and 2-space indents. CI runs `prettier --check`        |
| TypeScript | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`; no `any`, no `@ts-ignore`                                     |
| ESLint     | typescript-eslint `strict-type-checked` and `stylistic-type-checked`, eslint-plugin-jsdoc, import ordering, and the limits below. Zero warnings allowed |
| Stylelint  | Standard config. Colors and sizes only through variables from `tokens.css`                                                                              |

**Readability limits.** ESLint enforces these on every PR.

| Rule                  | Limit                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| Function length       | 40 lines (80 for Preact view components), not counting blank lines and comments                  |
| File length           | 300 lines                                                                                        |
| Cyclomatic complexity | 10 per function                                                                                  |
| Nesting depth         | 3 levels                                                                                         |
| Parameters            | 3; past that, pass one options object                                                            |
| Ternaries             | Not nested                                                                                       |
| Names                 | No single letters except loop indexes; no abbreviations except id, url and db                    |
| Doc comments          | Required on every exported function, type and component; they say what it's for and why, not how |

**One way to do each thing.**

| Topic          | Always                                                                                                                               | Never                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Modules        | Plain functions grouped by feature; named exports; `node:` prefix for built-ins; `#core/...` path aliases across folders             | Default exports, barrel `index.ts` files, `require`                       |
| Functions      | `function` declarations for anything named; arrow functions only for short inline callbacks                                          | Classes, except `Error` subclasses                                        |
| Data           | `type` aliases for plain objects, `readonly` where possible, string unions for fixed sets                                            | Classes for data, `enum`, `interface` (one kind of type keeps it uniform) |
| Async          | `async` / `await`, with Node callback APIs wrapped once in core                                                                      | `.then()` chains, callback pyramids                                       |
| Errors         | Throw an `AppError` with a code; routes map codes to HTTP statuses in one place                                                      | Returning `null` to mean failure, empty `catch` blocks                    |
| Missing values | `undefined`, with `?.` and `??`                                                                                                      | `null`, except where SQLite returns it inside a repository                |
| Loops          | `for...of`, `map` and `filter`                                                                                                       | `reduce` (except simple sums), `forEach` with side effects                |
| SQL            | Prepared statements in `core/db/repositories`, one function per query, named for what it returns (`findItemsByQuery`)                | SQL outside repositories, ORMs, query builders                            |
| Validation     | TypeBox schemas on every route through Fastify's type provider                                                                       | Hand-written checks inside handlers                                       |
| Naming         | camelCase for values, PascalCase for types and components, kebab-case file names, verbs for functions, `is`/`has`/`can` for booleans | Hungarian prefixes, vague names like `data`, `info` or `handle` alone     |
| Comments       | Why, not what; one header line per file saying what it's for                                                                         | Commented-out code, TODOs without an issue link                           |
| Client code    | Plain DOM APIs, one module per behavior, hooked to `data-` attributes                                                                | Client frameworks, globals, inline event handlers                         |

**Before a PR is opened.** Claude Code rereads its own diff against STYLE.md and rewrites anything a newcomer would have to read twice, then runs the `code-reviewer` agent (`.claude/agents/code-reviewer.md`) and fixes its blocking findings. The PR template has a short checklist for this. Formatting changes never share a PR with logic changes, and generated or minified code is never committed; `package-lock.json` is the only exception.

## Build plan

The work ships as 25 PRs in this order. There's one addition to the PRD roadmap: a gate build between Phase 0 and Phase 1. The design gate compares built screens with the mocks, so the data layer, scanner and three templates have to exist before the gate rather than after it.

| #   | PR                                                                                                                                                                          | Phase      | PRD rows           | Done when                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | Scaffold: TypeScript, Fastify, Preact SSR, Vite, Vitest, Prettier, ESLint and Stylelint with the readability limits, STYLE.md, `/healthz`, 127.0.0.1 binding and Host check | 0          | R27, R32, R33      | An empty page renders; security tests pass; format and lint report zero issues. **Done in the initial commit.**         |
| 2   | ci.yml, a Playwright smoke test, the PR-title check, `setup-repo.ts`                                                                                                        | 0          | —                  | CI is green on Windows; the ruleset is on                                                                               |
| 3   | release.yml, build.yml, portable packaging, data folder choice, launcher, first-run setup page, shortcuts, README and its check                                             | 0          | R29, R30, R31      | Following the README, the v0.1.0 zip runs from a path with spaces and completes first-run setup with either data choice |
| 4   | Fixture generator, `seed.json`, perf database generator                                                                                                                     | 0          | —                  | Fixture counts match the brief; CI caches them                                                                          |
| 5   | Schema, migrations, field system, repositories                                                                                                                              | Gate build | R3, R14 (core)     | Migration tests pass                                                                                                    |
| 6   | One-shot scanner, classification, page folders, thumbnail queue for every P0 format                                                                                         | Gate build | R4, R6             | The fixture indexes, and every format has a thumbnail                                                                   |
| 7   | Query engine, Index template, tab bar with Settings, banner, footer, minimal group-by                                                                                       | Gate build | R18, R13 (minimal) | Frames 1–4 and 11 render from the fixture                                                                               |
| 8   | Item template with image, video and reader viewers; viewing mode                                                                                                            | Gate build | R19, R21           | Frames 5–9 render                                                                                                       |
| 9   | Model profile template and Home strips                                                                                                                                      | Gate build | R16, R34           | Frames 10 and 12 render                                                                                                 |
| 10  | Edge states                                                                                                                                                                 | Gate build | —                  | E1–E6 render                                                                                                            |
| —   | **Design gate:** built frames 1–12 and E1–E6 posted next to the mocks; Jim approves; the baseline PR merges with `baseline-approved`                                        | Gate       | —                  | Baseline is on main                                                                                                     |
| 11  | Watcher, reconcile, moves, offline roots, SSE progress                                                                                                                      | 1          | R1                 | A new file shows up within 5 s                                                                                          |
| 12  | Ingest: drag, drop, paste, URL fetch, Inbox                                                                                                                                 | 1          | R2                 | Source URLs are kept                                                                                                    |
| 13  | Settings page (frame 15) for subcategories, folder mappings and watched folders; manual filing; Unsorted                                                                    | 1          | R4, R5, R36        | A file in a mapped folder files itself                                                                                  |
| 14  | Collections, tags with autocomplete, selection and the bulk action panel (frame 13)                                                                                         | 1          | R9, R10, R37       | 200 items are tagged in one action                                                                                      |
| 15  | Search grammar, FTS, filter bar, removable filters                                                                                                                          | 2          | R24                | 200 ms at 50,000 items                                                                                                  |
| 16  | Viewer polish: zoom and pan, video scrub, reader spreads and jump-to-page, viewing history                                                                                  | 2          | R19, R21, R35      | A 300-page PDF shows page 1 in under 2 s                                                                                |
| 17  | Models: field settings with 30-day restore, profile editing (frame 14), model tagging, preview strips                                                                       | 2          | R14, R15, R16, R38 | 200 photos are linked to a model in one action                                                                          |
| 18  | Item fields UI: notes, source URL, rating                                                                                                                                   | 3          | R11                | A new field appears on every item page                                                                                  |
| 19  | Duplicate detection                                                                                                                                                         | 3          | R8                 | Re-importing a file links to the existing item                                                                          |
| 20  | HEIC, TIFF, WebM, PSD preview                                                                                                                                               | 3          | R7                 | Each format imports, gets a thumbnail and opens                                                                         |
| 21  | Model tags on page ranges                                                                                                                                                   | 3          | R17                | The profile opens the item at that page                                                                                 |
| 22  | Video frame-step and loop range                                                                                                                                             | 3          | R20                | Frame-step works on MP4 and MOV                                                                                         |
| 23  | Compare board                                                                                                                                                               | 3          | R22                | The layout survives a restart                                                                                           |
| 24  | Backup and restore                                                                                                                                                          | 3          | R26                | A restore on a fresh install brings everything back                                                                     |
| 25  | 1.0 release                                                                                                                                                                 | 3          | All P0 and P1      | release-please cuts 1.0.0                                                                                               |

A PR is done when its row tests pass, CI is green, no screenshot changed (or the change was approved), and `docs/ARCHITECTURE.md` matches what was built.

## Risks and decisions

The biggest technical unknowns are PDF covers rendered in Node and how stable screenshots are on hosted runners. Both are tested early: PDF covers in PR 6, screenshots from PR 2.

| Risk                                                                    | Mitigation                                                                                                                                                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-side PDF covers (pdf.js with @napi-rs/canvas) fail on some files | Spike it in PR 6. Fallback: the browser renders the cover the first time it's viewed and posts it back                                                                          |
| chokidar uses too many handles or too much memory on a large tree       | Measure on a synthetic 50,000-file tree in PR 11. If needed, swap in @parcel/watcher behind the same interface                                                                  |
| Screenshot diffs flake on hosted runners                                | Windows fonts only, a frozen clock, GPU off, fonts and images loaded before capture. Baselines come only from the CI runner                                                     |
| A runner image update changes font rendering and fails every PR         | Pin the runner to `windows-2025` rather than `windows-latest`, and refresh baselines on purpose when moving to a new image                                                      |
| The `baseline-approved` label is a weak control                         | Agent rule 1 forbids adding it. If Claude Code pushes with Jim's GitHub credentials, GitHub can't tell who added the label; a separate bot account for the agent would fix that |
| Native modules don't match the bundled Node                             | CI and packaging both read `.nvmrc`, and the smoke test launches the packaged app                                                                                               |
| Windows blocks the downloaded zip (Mark of the Web)                     | The README says to Unblock the zip before extracting it                                                                                                                         |
| Chromium can't play some video codecs                                   | Show the poster frame and a note; no transcoding in v1                                                                                                                          |

| Decision (31 Oct 2026)                                             | Why                                                                                                       |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Preact server-side components instead of string templates          | Type-checked templates that escape by default; no hydration                                               |
| One query language for URLs, the filter bar and search             | One compiler to test and tune                                                                             |
| Custom fields stored as rows in field\_values                      | Fields can be added or renamed without a migration (R11, R14)                                             |
| Paths stored relative to a root                                    | A drive-letter change is one setting                                                                      |
| A gate build before Phase 1                                        | The gate compares built screens, so the templates must run on real data first                             |
| release.yml calls build.yml instead of a tag trigger               | Tags pushed with the default token don't start workflows                                                  |
| A minimized console window shows the server is running             | No tray app or installer needed; closing the window stops the server                                      |
| Default port 47613                                                 | Seldom used by other software; falls back up to 47622 and is saved in `settings.json` in the data folder  |
| App data beside the app by default, or in a folder chosen at setup | The default moves, updates and uninstalls as one unit; the choice suits a bigger or backed-up drive (R29) |
| Readability limits and the one-way-to-do-it rules enforced by lint | Rules a machine checks stay consistent across many agent-written PRs (R32, R33)                           |
| README.md doubles as the user manual, shipped as README.html       | One source for GitHub and the zip, opened in a browser without Markdown tools (R31)                       |
| Every PR runs the code-reviewer agent before it opens              | Nobody reads agent-written code before it merges; the agent stands in for that review                     |
