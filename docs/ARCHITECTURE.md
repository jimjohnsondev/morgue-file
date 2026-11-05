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
      main.ts         starts the server (npm run dev, tests)
      launcher.ts     shortcut entry: health check, start or reuse, open the browser (logic in launch.ts)
      run.ts          listens on the first free port, locks the data folder, saves the port
      install/        morgue-file.json, the data folder and its settings.json, the lock file, setup
      app.ts          Fastify instance, plugins, security hooks
      config.ts       port, data folder, settings.json; every path resolved from the app folder
      assets.ts       reads Vite's manifest; serves the hashed client files
      error-handler.ts maps AppError codes to HTTP statuses
      security/       host check, origin and token check, CSP
      routes/         pages/, api/, media.ts, events.tsx (SSE), healthz.ts, assets.ts, setup.ts
      views/          Preact SSR: layout/, templates/ (Index, Item, ModelProfile), parts/
    core/
      errors.ts       AppError and its codes
      db/             connection, library.ts (open and migrate), migrations/NNN_name.sql, repositories/
      query/          lexer, parser, AST, compiler to SQL, canonical form
      fields/         the shared field system for items and models
      models/         creating a model profile (unique slug, Name field)
      slug.ts         URL slugs for subcategories and models
      archive/        originals.ts (only fs access to roots), classify.ts, pagefolder.ts
      indexer/        walk.ts, scanner.ts, watcher.ts, reconcile.ts, moves.ts, roots.ts
      jobs/           queue.ts, thumbnails.ts, workers/ (thumb-image, thumb-pdf, thumb-video, thumb-pages, hash)
      ingest/         ingest.ts, fetch-url.ts
      backup/         zip export and restore
    client/           Vite entries: main, selection, dropzone, keyboard, viewer-image, viewer-video, reader, compare
    styles/           tokens.css (approved design values), base.css, templates.css, banner.svg
  scripts/            make-fixtures.ts, seed-fixtures.ts, make-perf-db.ts, copy-migrations.ts, package-win.ts, setup-repo.ts, check-readme.ts
    fixtures/         the fixture planners and writers make-fixtures.ts and make-perf-db.ts run
  packaging/          Morgue File.cmd and Install shortcuts.cmd, copied into the zip as they are
  fixtures/seed.json  invented tags, collections, models, field values
  tests/              unit/, integration/, e2e/, visual/ (+ __screenshots__/), perf/, migrations/, package/
  .nvmrc  .editorconfig  .prettierrc.json  package.json  tsconfig.json  tsconfig.build.json  vite.config.ts  vitest.config.ts
  playwright.config.ts  playwright.package.config.ts  eslint.config.js  stylelint.config.js  release-please-config.json  .release-please-manifest.json
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

**As built in PR 5.**

- `001_initial.sql` creates every table above except `item_search` and `model_search`, which arrive with the query language in PR 15 as their own migration, together with the code that rewrites search rows. All tables are `STRICT`. Timestamps are ISO text; `items.mtime` is milliseconds since the epoch. `rel_path`, `rel_prefix` and tag names compare `NOCASE`, as Windows paths do, so one file can't get two rows. SQLite folds only ASCII case there, so `Études/` and `études/` differ; the scanner (PR 6) and folder mappings (PR 13) should fold case in code if that matters on real drives. Slugs and field keys keep letters of any script and drop accents on Latin letters only (`Études` → `etudes`, `人物画` and `ガ` stay). So they can be non-ASCII: the `/<section>/<slug>` and `/models/<slug>` routes (PR 7, PR 9) must percent-decode the slug, and the query lexer (PR 15) must accept `\p{L}` in `key:x`.
- The schema version is SQLite's `user_version`. The backup is a `VACUUM INTO` copy (it includes what's still in the WAL), named `library-<app version>-<UTC time>.db`; the five newest by time are kept. A brand-new database has nothing to back up. `tsc` emits only JavaScript, so `build:server` runs `scripts/copy-migrations.ts` to copy the SQL files into `dist/core/db/migrations/`.
- `openLibrary()` (`core/db/library.ts`) opens `library.db` in the data folder, migrates it and points root 1 at the Reference folder from `settings.json`. The server starts calling it in PR 6, at launch and when setup finishes, which is when the indexer first needs the database.
- Folder mappings match whole folder names (`Figure` holds `Figure/a.jpg`, not `Figures/a.jpg`), and `insertItem` and `refileItemsByMappings` share the one SQL rule. Items filed by hand are left alone.
- Field keys come from labels (`Agency link` → `agency_link`) and never change, so renaming keeps searches working. Keys that are search words (`tag`, `model`, `in`, `sub`, `type`, `rating`, `collection`, `unsorted`) are refused. Link values must be http or https, dates `YYYY-MM-DD`, pick-list values one of the choices. A model's Name can be renamed but not removed. Removal and the 30-day restore are in the core now; the Settings page for them is PR 17, and purging after 30 days lands with it. The 1–5 range of rating is enforced with the item fields UI in PR 18.
- No released version has a database yet, so the migration tests run against a fresh database and a hand-made next migration. The first release with a schema adds its fixture database under `tests/migrations/`.

## Indexing and file watching

The server starts answering before indexing begins, then indexes in the background. All indexing work is recorded in `library.db`, so a restart resumes where it stopped. This is how the first index of about 1 TB is browsable within the first minute.

1. **Startup:** open the database, run migrations, start listening, then begin a reconcile scan of each online root.
2. **Scan:** stream directories with `fs.opendir` and compare each file's path, size and mtime with `items`, 500 rows per transaction. A new file gets an item row and a thumbnail job. A changed file is updated and its thumbnail requeued. A file that wasn't seen gets `missing_since` set; items are never deleted.
3. **Watch:** start watching each root just before its scan, holding what it sees until the scan ends, so nothing changed during a long first index is lost. Changes wait for 1 s of quiet (at most 2 s), so a short copy isn't read half-written; a longer one is read while it grows and read again when it changes. Every change runs the same reconcile for the folder it touched; R1 allows 5 s. (As built in PR 11 with Node's own recursive `fs.watch`, not chokidar; see below.)
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
- Image and PDF jobs run on a piscina worker pool sized max(1, cores ÷ 2). Video frames use at most 2 ffmpeg processes. (As built in PR 6, they run in the main process; see below.)
- A failed job is retried 3 times, then marked failed; the error shows on the item page.
- Progress (E5) streams to pages over SSE at `/events`, with pause and resume (as built in PR 11, below).

**As built in PR 6.**

- `core/indexer/walk.ts` walks a root folder by folder, in name order, through `listFolder()` in `originals.ts` (`fs.opendir` plus a `stat` per file; links are skipped). `scanner.ts` compares what it finds with `items` by path, folding ASCII case as SQLite's `NOCASE` does, and writes 500 changes per transaction. A second file whose name differs only in case (possible off Windows) is counted as ignored.
- A scanned file's `added_at` is its own modified time (never later than now), so a first index lists the archive newest first by file date, as the fixture's "Recently added" expects. Ingest (PR 12) will use the drop time.
- A subfolder that can't be read is skipped and counted, and its items aren't marked missing, nor is the folder itself if it was a page folder. An unreadable root fails the scan. A root that isn't there is marked offline before anything else happens, so no item is marked missing; the 30 s re-check, moves and partial hashes arrived in PR 11; banner E3 arrived in PR 10.
- The page-folder rule takes files named by a number alone (`001.jpg`), never the root itself or anything under `Inbox/`, where pasted screenshots such as `1.png` and `2.png` stay photos. A page folder's size is the sum of its pages and its time is the newest page's.
- Job types are `thumb-image`, `thumb-video`, `thumb-pdf` and `thumb-pages` (CBZ files and page folders). An item has one row per type; queuing it again resets a finished row. A job gets 4 attempts (one try, three retries), then it and the item's `thumb_state` are marked failed. Finished rows stay as `done`.
- **Departure: no piscina yet.** Jobs run in the server process in two lanes: images, PDFs and pages share max(1, cores ÷ 2) places, and videos have 2. sharp does its work on libuv's thread pool and ffmpeg runs as a child process, so neither blocks a request. pdf.js renders page 1 on the main thread, which takes about 250 ms for a fixture PDF. If the 50,000-file test in PR 11 or the perf suite shows that hurting page times, `thumb-pdf` moves to a worker pool (piscina) then. piscina isn't a dependency until that happens.
- The queue makes the default size: 320 px squares for images and videos, 320×464 covers for PDFs, CBZ files and page folders. Files are `thumbs/<id mod 256, two hex digits>/<id>-320.webp` or `<id>-320x464.webp`, written under a `.partial` name and then renamed. Squares crop with sharp's `attention` position; covers keep the centre.
- Thumbnail jobs also store media details: the displayed width and height of images (after EXIF rotation), ffprobe's size, frame rate and duration for videos, and `page_count` for PDFs (pdf.js), CBZ files (image entries) and page folders.
- pdf.js is the legacy build, given `pdfjs-dist/standard_fonts/` (written with forward slashes and a trailing `/`, which pdf.js insists on even on Windows), because PDFs that name Helvetica without embedding it (as the fixture's do) draw no text without them. It renders onto an `@napi-rs/canvas` canvas.
- Workers name originals by root and relative path. Images, PDFs and page-folder pages are read with `readOriginal()`; CBZ files are opened read-only by `openOriginal()` and read by yauzl from that descriptor. ffmpeg and ffprobe open videos themselves, so they get the path from `resolveOriginalPath()`, which refuses any path outside the root. That is the only place a path to an original leaves `originals.ts`.
- ffmpeg and ffprobe come from `ffmpeg-static` and `@ffprobe-installer/ffprobe`, both dev dependencies. A development checkout uses them from `node_modules`; `package-win.ts` copies the Windows binaries into the zip's `bin\`, with their GPL-3.0 license text in `LICENSES\`, and the app looks there first.
- Runtime dependencies added: sharp (moved from dev), pdfjs-dist, @napi-rs/canvas and yauzl, all named above.
- `server/library-runtime.ts` opens the library once the install is ready: at launch after the server is listening, when setup's Save finishes, or when a missing data folder comes back. It then scans root 1 once, waking the queue after each 500-row batch so thumbnails start before a long scan ends, logs the scan summary (the scan log, with the ignored count) and runs the queue. A library that won't open is logged, and the server keeps answering. The queue never lets a job's failure escape as an unhandled rejection; if even recording the outcome fails, it is logged. Stopping the server aborts the scan, waits for running jobs and closes the database.
- Thumbnails are served from PR 7 (see Server, routes and templates).
- A file that changes while its thumbnail job is running no longer keeps the old thumbnail (PR 11): the job reads the item again when it ends, and if a scan has recorded a new size or time meanwhile, it fails that attempt, so the queue's retry makes the thumbnail from the new file.

**As built in PR 11.**

- **Departure: `fs.watch`, not chokidar.** `watchOriginals()` in `originals.ts` runs Node's own `fs.watch(root, { recursive: true })`. On Windows that is one `ReadDirectoryChangesW` handle on the root, so folders inside it can still be renamed or moved in Explorer while the app runs; chokidar opens a handle per folder, and NTFS refuses to rename a folder while anything inside it has a handle open. It also needs no startup walk and no extra dependency. Node reports only a path, so the watcher looks at what is there now (`findEntryKind()`). Measured on a synthetic 50,000-file tree (500 folders) on Linux, where Node walks the tree once to set up inotify: 0.6 s to start, 114 MB, a change reported in 5 ms. On Windows there is no walk. This closes the chokidar risk below.
- `indexer/watcher.ts` gathers changed paths until 1 s passes with no new change, or 2 s after the first, so a long copy still shows within 5 s. It then scans, one at a time: for a file, its folder alone (shallow, so a page folder's pages are judged together); for a folder, or a path with nothing there now, that folder and everything under it, then its parent shallowly. Removals go first, so a moved file's old place is already marked missing when its new place is scanned. A path Node can't name (its change buffer overflowed) scans the whole root. If `fs.watch` itself fails, the watcher stops and the root is scanned in full again, which starts a new watcher. The watcher starts before the full scan (`startHeldWatcher`) and gathers changes without scanning them until `release()`, so a file added during a long scan to a folder it has already passed still shows; batches are sorted one after another, in order.
- `indexer/reconcile.ts` holds the comparison the full scan and the watcher share (`reconcileEntries`); `scanner.ts` has `scanRoot()` for a whole root and `scanFolder()` for one folder or subtree, which checks the root first, treats a folder that is gone (`ENOENT`, `ENOTDIR`) as empty so its items go missing, and leaves one it can't read alone. `walkRoot()` takes a start folder and a shallow flag.
- Moves (`indexer/moves.ts`): a new path whose kind and size match an item that is unseen in the same pass, or missing since less than 10 minutes ago, is held back until the walk ends. Then its partial hash is compared with theirs, and a match re-points that item (`moveItem()`): it keeps its id, so tags, collections, fields and models stay, and it is filed by its new folder's mapping unless it was filed by hand. Anything else is added. Only size collisions are hashed during a scan, so a first index reads no extra bytes.
- The partial hash is SHA-256 over the size and the first, middle and last 64 KiB (`readPartialHash()` in `originals.ts`). Each item's thumbnail job stores it first, so it is kept even when the thumbnail fails (a video with no ffmpeg). Items indexed by 1.6.1 and earlier have none, so after each full scan that finds the folder there, `roots.ts` queues a priority-2 `hash` job (`core/jobs/hash-jobs.ts`, in the images lane) for every present item with no hash and no queued or running job that will store one. A page folder's stand-in is a hash of its pages' names and sizes, which move together. A changed file's hash is cleared until its job runs again, and an item with no hash yet can't be matched; it is added as new and its old item stays missing.
- `indexer/roots.ts` keeps root 1 indexed: watch and scan, then watch. A check every 30 s, online or not, marks the root offline if its folder has gone (Windows doesn't report a rename of the watched folder itself, and an unplugged drive may report nothing), scans it again once it is back, and retries a scan that failed. A watcher lost during the full scan isn't kept: the next check scans again, since changes after the loss were missed. A watcher that couldn't start after a finished scan is retried alone, so a folder that can't be watched isn't rescanned every 30 s. Changes made while there was no watcher are picked up only at the next full scan (a restart, or the folder coming back). On Windows, Node may also report last-access changes, so reading originals for thumbnails can cause folder scans that find nothing; they are cheap, but if a first index shows them costing time, skip unchanged folders (not measured; no Windows machine here). A folder scan that finds the root gone marks it offline at once. Counting and pausing live in `indexer/scan-progress.ts`. It reads the root's path from `roots` each time, so a path changed in Settings (PR 13) takes effect at the next scan. The runtime (`server/library-runtime.ts`) starts it and passes on `controlIndexing('pause' | 'resume' | 'check')`.
- Pause holds the scan between files, including later scans, until Resume; "Check again" runs the 30 s check at once. Thumbnail jobs carry on, so the page being viewed still gets its thumbnails.

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
- **Page reader:** one reader handles PDF, CBZ and page folders, with single or spread view, a thumbnail strip and jump-to-page. For PDFs it renders only the pages on show and the strip pages scrolled into view, so a 300-page PDF shows page 1 in under 2 s (R21).

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
| `POST /api/indexing/<pause\|resume\|check>`                                | 204                                                      | E5's Pause and Resume, E3's Check again (PR 11)                                                                                  |
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

**As built in PR 7.**

- Index pages: `/photos`, `/video`, `/library`, `/<section>/<slug>`, `/unsorted`, `/tags/<name>`, `/collections/<id>` and `/search` all build a query and render it through one Index template (`server/views/templates/index-template.tsx`); `routes/pages/list-model.ts` reads the page and lays it out. Lists run Photos, then Video, then Library, and within a section oldest first by `added_at` (then id), so a folder reads in its own order and frame 1's page 3 starts at `figure_0193.jpg`. Migration `002_list_order.sql` adds `items (section, added_at, id)`, and a list within one section leaves out the section rank, so a deep page reads its ids straight from that index; the page's ids are found before any display data is joined. The `COUNT(*)` isn't cached yet: the perf suite renders every Index page well inside 300 ms without it. Add the cache if PR 15's full-text queries need it.
- How a list is viewed lives in the URL: `page`, `per` (48, 96, 192), `size` (small, medium, large) and `filters` (shown, hidden). Library shelves open with the filter panel folded (frame 2), other lists with it open. Saving the size and per-page choice in `settings` comes with the Settings page (PR 13).
- The filter panel is a GET form to `/search`. It sends the page's query minus its plain filters as `base`, plus one field per control; `/search` folds them into one canonical query and answers 303 with its address. v1 has no OR, so ticking more than one section or file type means any of them. The chips on `/search` link to q minus one term (frame 4).
- Group-by (R13, minimal): a subcategory with `group_by` (`{"field":"magazine_title"}`) lists one cover per value, the newest item's, at `/<section>/<slug>`, and each value's items at `/<section>/<slug>/<slug of the value>`, grouped by the year of the subcategory's own date field (`issue_date`) and newest first (frame 3). Other group-by fields and the "Group by" choices come with PR 15's filter bar.
- Thumbnails are served at `/media/thumb/<id>/<240|320|480|320x464>?v=<file time>`. A missing default thumbnail is answered with a 1×1 transparent SVG (`no-store`; the gray behind it comes from `tokens.css`) and its job moves to priority 0; `client/thumb-retry.ts` asks again a few times. Small and Large squares are made from the original the first time a page asks, in the request, once the default exists. If one can't be made (the original is offline), the default size stands in, sent `no-store` so the real one is fetched later, and nothing is re-queued. Making these sizes has no concurrency limit yet; if a first Large page of 192 proves slow, route them through the queue.
- The banner is the canvas's banner SVG, copied to `src/styles/banner.svg` and bundled by Vite as a file (`assetsInlineLimit: 0`, since the CSP refuses `data:` images); the asset route serves `.svg` too. `tokens.css` gained the few extra shades the canvas uses (the dark ground, bevel edges, text on dark bars).
- A page or thumbnail asked for before the library is open is refused with `library-unavailable` (503). Home still renders, without counts.
- Query engine (`core/query/`): `parse-query.ts` never fails (anything unknown is a word), `canonical-query.ts` writes the canonical q, `compile-query.ts` builds a condition on `items` from fixed SQL fragments with every value bound. It is the one place outside `core/db/repositories` that writes SQL text, as this doc's layout says; the repositories run it. Until full-text search arrives in PR 15, words and phrases match the file path with `LIKE`.
- Tests: the e2e server's home (`tests/support/make-e2e-home.ts`) now indexes the fixture archive and applies `seed.json` before the server starts, so e2e pages show the brief's content. The R18 perf test starts its own server on a copy of `perf.db`. Screenshot specs for frames 1–4 and 11 arrived with the gate's baseline PR, together with frames 5–12 and E1–E6 (see Screenshot specs).
- Not built yet, so its links answer 404: `/settings` (PR 13). `/models` and the collections list arrived in PR 9. `/item/<id>` arrived in PR 8.

**As built in PR 8.**

- `/item/<id>` (`routes/pages/item-route.tsx`, the Item template in `views/templates/item-template.tsx`) takes its view from the URL like Index pages do: `from` (the canonical q of the list it was opened from), `page` and `layout` (`single`, `spread`) for the reader, `details=hidden` (frame 6) and `mode=viewing` (frame 9). Prev, Next and every reader link keep these, so the folded panel and viewing mode last from item to item, and everything but the viewers works with JavaScript off.
- Prev, Next and "3 of 1,236 in Figure" (`routes/pages/list-context.ts`): the position is a count of rows before the item and Prev/Next are keyset lookups with `LIMIT 1`, all on the list order's row value (`findListPlace` in `item-lists.ts`). A grouped value's page (frame 3) lists newest issue first, so its items step in that order instead, read whole (a title has tens of issues). The list is named from its query: section, subcategory, Unsorted, tag, collection or grouped value, else "search results" linking to `/search`. An item opened without `from` steps through its magazine title, subcategory or Unsorted; a `from` that no longer holds the item, or doesn't compile, shows no Prev/Next. The count isn't cached, as on Index pages.
- Keys live in `client/keyboard.ts` (← → V Esc), `viewer-image.ts` (+ − 0), `viewer-video.ts` (, . and I O or [ ]) and `reader.ts` (PageUp, PageDown), sharing `client/keys.ts`, which ignores keys a focused field wants (and only the arrow keys of a slider). V and Esc toggle a class on `<body>` and rewrite `mode` in the address and in every `/item/` link, without a reload.
- Image viewer: Fit fills the viewer with `object-fit: contain`; 100%, 200% and the − + steps set a width in pixels and the viewer scrolls, with drag to pan. Video player: a native `<video>` with the controls of frame 7 drawn by the page; frame-step seeks by 1 ÷ fps (30 until ffprobe has measured it) and the loop is kept on `timeupdate`, which is a few frames loose. PR 22 makes both frame-exact with `requestVideoFrameCallback`.
- Page reader: spreads pair pages as print does (1, 2–3, 4–5 …, so 12 faces 13). CBZ files and page folders show `<img>` pages from `/media/page/<id>/<n>` (`core/archive/publication-pages.ts`; yauzl reads entry n from a descriptor opened by `originals.ts`). PDFs get `<canvas>` slots that `client/reader.ts` fills with pdf.js (`pdfjs-dist`, already a dependency), loaded with a dynamic `import()` so other pages don't fetch it, `disableAutoFetch` and `disableStream` so only the ranges for the pages on show are read, and strip pages drawn as they scroll into view. pdf.js's worker is bundled by Vite as `pdf.worker.min-<hash>.mjs`, so the asset route now serves `.mjs` and names with dots. No `standardFontDataUrl` is given: in a browser pdf.js draws the non-embedded standard fonts with system fonts. Page-strip pictures of CBZ files and page folders are the full page pictures, loaded lazily; small strip thumbnails can come with PR 16 if real scans make the strip slow.
- `/media/original/<id>` streams the original read-only through `streamOriginal()` in `originals.ts`, with one HTTP byte range (`routes/byte-range.ts`; several ranges get the whole file), `Accept-Ranges`, `Last-Modified` and `cache-control: no-cache`. A file that is gone or offline answers 404, as does a page folder (it has no single file). E4 in the viewer arrived in PR 10.
- The details panel draws the facts by kind, then tags, models (with their page ranges, linking into the reader) and collections as chips, then the item's own fields from the fields table (R11): short values first, long text as a box. The editing controls of frames 5, 7 and 8 (Add tag, x on chips, [move], [change], add model, add to collection, the notes box) are drawn as the frames show them but `disabled`, until tags and collections (PR 14), filing (PR 13), models (PR 17) and item fields (PR 18) make them work. "Show in folder" from the mocks is left out: a browser page can't open Explorer, and it would need an API of its own.
- Viewing history (R35) isn't recorded yet; PR 16 adds it with the viewer polish.

**As built in PR 9.**

- `/models/<slug>` (`routes/pages/model-route.tsx`, the Model profile template in `views/templates/model-profile-template.tsx`) shows the portrait (the Large square of the chosen item), every model field the fields table holds, the model tags, an "Appears in" notice, and one preview strip (`views/parts/preview-strip.tsx`) per section the model is in (R16). Each strip is the first six items of `in:<section> model:"<name>"` in list order and links to that search; Library covers are captioned with the pages the model is on. A section with no items gets neither a strip nor a link. The edit links of frame 10 are drawn `disabled` until PR 17.
- `/` (`routes/pages/home-model.ts`, `views/templates/home-template.tsx`) stacks five strips in frame 12's order, hiding any with nothing in it, beside a side column of archive counts and keys (R34). Pick up where you left off reads each item's latest view, with the video time or page reached as a caption; reopening at that place comes with PR 16 (R35). Ctrl+V is left out of the keys list until paste works (PR 12).
- From the archive is not truly random: items are ordered by `(id × m) mod 4294967291`, where the multiplier m comes from the seed (`2654435761 + seed × 2246822519`, mod the same prime). The seed changes the multiplier, not an offset, since an offset only rotates the order and would pick mostly the same items. One seed always picks the same items. The seed is the day number unless `?shuffle=<n>` names one; "shuffle »" links to the next seed, and screenshot tests can ask for a fixed one.
- The lists behind Home's strips that aren't a query are fixed lists in the Index template with no pager or filter panel (`routes/pages/card-lists.ts`): `/models` (one portrait card per model), `/collections` (each collection's first item as its cover; this was planned for PR 14), `/history` (the last 200 items viewed), `/recent` (the newest 96 items) and `/archive?shuffle=<n>` (96 picks for the seed, the strip's six first). The Recently added order sorts `items` by `added_at` without an index; add one if Home grows slow on a large archive.

**As built in PR 10.**

- The edge states are drawn from the library's real state. `routes/page-status.ts` reads what the shared frame (`views/layout/page-layout.tsx`) shows around every page, through `views/parts/status-notices.tsx`: E3's band under the tabs while root 1 is `offline`, with the count of its items not already missing (`countKeptItems`); E5's bar under the tabs and two footer lines while a scan runs; and E6's "Saved to Unsorted" notice when the address carries `saved=<item id>` (`SavedQuerystring`, part of every page route's schema). "dismiss" is the same address without `saved`; "from example.com" is the host of the item's `source_url` field. Ingest (PR 12) lands on its page with `saved`, which also covers drops with JavaScript off.
- E1 and E2 are the Index template's empty state (`EmptyHelp`): Unsorted says how files get there and links to Photos and Library; a search with terms and no results links to the search without each term in turn (`noResultsHelp`, q minus one term) and to a cleared search. E1 leaves "paste with Ctrl+V" out until paste works (PR 12), as Home's keys do.
- E4: the Item page's viewer slot shows the item's default-size cached thumbnail, enlarged, with a note (`views/parts/unavailable-viewer.tsx`), when its root is offline or the item has `missing_since`. Image, video and reader alike, since none can open without the original. The note names the file's full path, says why it can't be opened, and links to try again (the same page) and back to its subcategory, magazine title or Unsorted.
- E5's numbers: `countFiles()` in `originals.ts` counts the Reference folder's files with `fs.opendir` and no `stat`, alongside the scan, and the scanner reports each listed folder's file count through `onFilesFound` (`walkRoot`'s `onFilesListed`). Both count every regular file, page-folder pages and ignored files included, so "12,400 of 48,000" adds up. The runtime keeps the latest figures in memory (`LibraryRuntime.indexing()`); until the count is in, the bar says "Indexing 12,400 files" and the meter is indeterminate. Every startup reconcile shows the bar while it runs, not just the first index. The page reads the figures when it's drawn, and `/events` keeps them current. E6's "file it now" is drawn `disabled` until PR 13; "Change folder location" links to `/settings` (PR 13).
- Live notices (PR 11): the frame wraps E3's band and E5's bar in `[data-status-slot="bands"]`, and E5's footer lines in `[data-status-slot="footer"]`; both slots are `display: contents`, so the page lays out exactly as before. `routes/events.tsx` reads the notices every 500 ms and, when their HTML changes, sends it in a `status` event (`StatusBands`, `StatusFooterLines`); `client/live-status.ts` swaps it into the slots. Pause, Resume and Check again are `button[data-indexing-action]`, which the client posts to `/api/indexing/<action>` with the token (a 403 means the server restarted and the token is stale, so the page reloads). Only one tab holds the stream: the browser allows six connections to the server, and a stream per tab would use them up. The tab holding a Web Lock opens `/events` and passes each update to the others on a `BroadcastChannel`; when it closes, another tab gets the lock and opens the stream. The app closes with `forceCloseConnections`, since open event streams would otherwise hold the server open.
- E6's outline: `client/drop-outline.ts` shows `[data-drop-outline]` while a drag carrying files or a browser address is over the page, and cancels the drop so the browser doesn't open the file in place of the archive. Saving the drop is PR 12.
- Left out of the mocks for now: E2's "search tips" link (there's no tips page until the filter bar, PR 15); E3's "thumbnails from cache" note in the grid title and the "offline" caption under each card (the band says it once for the whole page); and E5's "Welcome" panel, which stands for whatever page is open.
- E3's band counts the items the offline root keeps (4,572 on the fixture archive). The brief's 4,312 is the archive's image count; that sentence counts every item, as the brief's own words say.
- Tests: `tests/integration/edge-states.test.ts` draws E1–E6 against a temp library put in each state; `tests/e2e/edge-states.spec.ts` drives E2 and E6 in Chromium on the fixture archive. E1 and E3–E5 can't be reached on the shared e2e server (its Unsorted holds 54 items, its drive is online and indexed before the tests start), so the gate's screenshot specs start a server of their own for them (see Screenshot specs).

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
| Writes to originals                                | `originals.ts` is the only module allowed to import `node:fs` for root paths (ESLint `no-restricted-imports`). It opens files read-only and exposes two writes: `writeInbox()`, and `createInbox()` for setup                        |

As built in the scaffold: `src/server/security/security-hooks.ts` runs the Host, Sec-Fetch-Site, Origin and token checks in one `onRequest` hook and sets the CSP, `nosniff` and `no-referrer` headers on every response, refusals included. The `no-restricted-imports` rule also exempts the few server files that read the app's own folders (`assets.ts`, `config.ts`, `main.ts`), plus `core/db` and `server/install` (PR 3), which manage the home and data folders. PR 6 narrowed the `core/jobs` exemption to the two files that touch the data folder and the app's `bin\` (`thumbnail-files.ts`, `workers/media-tools.ts`), so the thumbnail workers must read originals through `originals.ts`.

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

- `npm run fixtures` (`scripts/make-fixtures.ts`) writes the archive to `fixtures/generated/Reference/` and a `manifest.json` beside it with every file's size and SHA-256. Each file is seeded from its own path, so its output is the same byte for byte on every run, whatever order the files are written in. It takes about two minutes and 250 MB. It clears its output folder first, so it refuses any folder outside `fixtures/` or the temp folder.
- Images are flat-shaded figures on color fields drawn with sharp. They are 1008×756 (or 756×1008), except frame 5's `seated_backlit_017.jpg` at its full 4032×3024. Drapery includes PNG, WebP and GIF, so every P0 image format is present.
- Videos are 2-second, 640×360 clips of ffmpeg's `testsrc` pattern (it shows a frame counter), encoded with the binary from `ffmpeg-static`; the even timelapses are MOV. Frame 7's `pose_session_04_seated.mp4` is made at its real 1920×1080, 30 fps and 3:15, so its timecodes and loop range fit.
- PDFs are lorem pages built with pdf-lib. CBZ files (zipped with yazl) and page folders hold page scans named by their number alone (`001.jpg`); page 1 is a cover with the title.
- The layout follows the brief's Folders row: `Figure`, `Portrait`, `Hands`, `Video/Poses`, `Video/Timelapses`, `Books` and `Magazines` (one subfolder per title) are mapped; Drapery sits in `Misc/` and is filed by hand; the 54 Unsorted downloads sit in `Inbox/`.
- Names and order follow the mocks. In each Photos folder, slot n holds `figure_000n.jpg` and so on, and file times rise with the slot. Slot 3 of Figure is `seated_backlit_017.jpg`, and Elena's 211 numbered photos (`figure_elena_103.jpg`, `hands_elena_106.jpg` …) fill slots 701 onward in Figure, Hands and Portrait. Frame 7's `pose_session_04_seated.mp4` is likewise third in Poses. Portrait is the newest folder, so `portrait_1488.jpg` heads Recently added. Book titles use frame 2's rule, so Elena's "Notes on Gesture" is `Notes on Gesture, vol. 2`.
- `fixtures/seed.json` holds the subcategories and folder mappings, Drapery's filing, tags, collections, the model fields, Elena Varga, field values and the viewing history for Home. Items are named by path, or by a pattern where `*` matches within a folder name and `**/` across folders. Its shape is checked by the TypeBox schema in `scripts/fixtures/seed.ts`, and unit tests check every pattern matches and every count against the brief.
- `scripts/seed-fixtures.ts` applies the seed through the app's own repositories and routes, so seeding exercises real code. It arrives with the repositories (PR 5) and grows as each feature lands. It seeds a library whose items are already indexed (the scanner, PR 6, does that), and runs on the built app. Until then, `tests/integration/seed-fixtures.test.ts` adds the items from the fixture plan and checks the brief's counts after seeding. Item page ranges have no label column, so "chapter 4" of Studies in Hands is seeded as pages 61–80.
- Counts match the brief: 4,312 images, 186 videos, 74 publications and 38 collections (4 named, the rest numbered). Elena Varga appears in 212 photos and 4 Library items, and `tag:hands model:Elena` matches 34 photos and 4 Library items.
- CI caches `fixtures/generated/`, keyed by a hash of the generator, the seed and `package-lock.json` (sharp and ffmpeg versions change the bytes). The `setup-playwright` action restores it, or makes it on a miss.
- `npm run fixtures:perf` (`scripts/make-perf-db.ts`) makes the synthetic 50,000-item library for the perf tests from a fixed seed, through the repositories and field system, at `tests/perf/perf.db` (git-ignored, and outside the cached `fixtures/generated/`). It builds the server first, since scripts import the app from `dist/`. It takes about 15 s, and the file follows the schema, so CI's `perf` job makes it fresh on every run instead of caching it with the archive.

**Stable screenshots.** The viewport is 2560×1440 at device scale 1, and the clock is frozen at 31 Oct 2026. Only system fonts are used. Tests start after every thumbnail exists, then wait for `document.fonts.ready` and for every image to finish loading. The caret is hidden.

**Screenshot specs (design gate).** `tests/visual/` holds three specs, with shared waits in `tests/support/screenshots.ts`. Every baseline lives in `tests/visual/__screenshots__/<spec file>/`, with no platform suffix, since only the Windows runner makes them.

- `gate-frames.spec.ts` captures frames 1–12 from the shared server. Each test reloads its page until the server's startup scan has finished (no E5 bar) and every `img[data-thumb]` is a real thumbnail rather than the 1 px stand-in, since the server is still scanning and making them as the tests start; E2 and E6 wait the same way. Before each capture that follows a click, the pointer moves to the page's corner and focus is dropped, so no hover style or focus ring is drawn; Item frames wait on the Index page they're opened from. Frame 7 seeks to the brief's playhead (0:42.12, frame 1,264) after setting the loop to 0:58.50–1:33.60; frame 8 jumps to pages 12–13 of LDQ No. 12.
- `edge-states.spec.ts` captures E2 and E6 on the shared server, and E1 and E3–E5 on small servers of their own, started by `tests/support/start-state-server.ts` with `MORGUE_STATE` set to `empty-unsorted`, `offline` or `indexing`. Each copies the first 24 Figure photos and 3 Books from the fixture archive (keeping their file times, so the footer's day is the fixture's), files them, makes every thumbnail and only then listens. `offline` then points root 1 at `E:\Reference` and marks it offline, as on the brief's E3 and E4. `indexing` reports a scan held at 12,400 of 48,000 files, the brief's E5 counters, through a wrapped `LibraryRuntime`; nothing in `src/` knows about it. Their counts are the small copy's, not the brief's.
- `setup-page.spec.ts` captures the setup page once per data choice, on a fixed empty home folder and a fixed `LOCALAPPDATA`, so the suggested folders are the same on every run.

**Baseline updates.**

- Baselines are only ever generated on the CI Windows runner, by `update-baselines.yml`, which commits the PNGs to the PR's branch.
- A required check, `baseline-guard`, fails if anything under `tests/visual/__screenshots__/` changed, unless Jim has added the `baseline-approved` label to the PR.
- The first baseline is created at the design gate.

## CI and release

A merged PR becomes a downloadable Windows zip with no human step. The only manual work is a one-time setup in Phase 0: a token and the branch rules.

| Workflow                 | Trigger                                          | What it does                                                                                                                       |
| ------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| ci.yml                   | Every pull request                               | Jobs `lint-typecheck`, `unit`, `e2e`, `visual` and `perf` on the Windows runner                                                    |
| pr-checks.yml            | Every pull request, plus title and label changes | Jobs `pr-title` and `baseline-guard` on Linux                                                                                      |
| release.yml              | Push to main                                     | Runs release-please with `RELEASE_TOKEN` and turns on auto-merge for its release PR. When a release is created, it calls build.yml |
| build.yml                | Called by release.yml, or run by hand for a tag  | Build, package, smoke test, then attach the zip and its SHA-256 to the GitHub Release                                              |
| update-baselines.yml     | Run by hand on a branch                          | Regenerates the screenshots on the Windows runner and commits them                                                                 |
| dependabot-automerge.yml | Dependabot PRs                                   | Turns on auto-merge for patch and minor updates                                                                                    |

As built in PR 2:

- The jobs are split across two workflows. `ci.yml` runs `lint-typecheck`, `unit`, `e2e`, `visual` and `perf` on `windows-2025` for every push to a PR. `pr-checks.yml` runs `pr-title` and `baseline-guard` on Linux and also re-runs when the title or labels change. Keeping them apart means adding a label never re-runs, or skips, the build and test jobs; GitHub can count a skipped required job as passing.
- `perf` got its first test in PR 7. `visual` got its specs in the design gate's baseline PR; `update-baselines.yml` still passes `--pass-with-no-tests`, so it can run on a branch that has none.
- The Playwright jobs share a composite action, `.github/actions/setup-playwright`: Node from `.nvmrc`, `npm ci`, a cached Chromium, then `npm run build`. Tests run the built server on port 47690.
- `update-baselines.yml` runs in two jobs so `RELEASE_TOKEN` never shares a workspace with the branch's own code. `render` installs, builds and updates the screenshots on Windows with no secrets, then uploads them. `push` makes a fresh Linux checkout, runs nothing from the branch, and commits them with `RELEASE_TOKEN`, with git hooks and global config turned off. A push made with `GITHUB_TOKEN` wouldn't start CI on the new commit. It fails on `main`. It adds and changes baselines; a deleted screenshot test leaves its old PNG for the PR to remove by hand.
- `baseline-guard` lists the PR's files, including the old path of a rename, through the paginated REST API, and fails if it can't list them all, so a large baseline PR can't slip through.
- `ci.yml` has no `merge_group` trigger on purpose: the repo has no merge queue.
- `dependabot.yml` ignores major versions; `dependabot-automerge.yml` turns on auto-merge for Dependabot's minor and patch PRs. It uses `pull_request_target` but never checks out the PR's code, so the write token never meets untrusted code. See ADR 0001.
- `scripts/setup-repo.ts` runs with plain `node` (Node strips the types itself), so it needs no extra dependency. It also creates the `baseline-approved` label and reports whether `RELEASE_TOKEN` is still missing.

**Why this differs from the PRD.** The PRD has build.yml trigger on `v*` tags. But tags and PRs created with the default `GITHUB_TOKEN` don't start other workflows, so release.yml calls build.yml directly. The release PR is opened with `RELEASE_TOKEN`, a fine-grained token with contents and pull-request write access to this repo. Using that token means CI runs on the release PR, so it can auto-merge.

**Version numbers.** release-please numbered the first release 1.0.0 (PR 3), and versions have counted up from there with every `feat:` merge. Jim chose to keep that numbering (4 Nov 2026). So "1.0" in the PRD and this doc names a milestone, not a version: the release in which every P0 and P1 row passes, whatever number release-please gives it. Never use a `Release-As` footer to force a version.

**One-time repo setup.** `scripts/setup-repo.ts` applies these through `gh api`. Jim runs it once with admin rights and creates the token by hand.

- A ruleset on main: PRs required; the ci.yml and pr-checks.yml jobs as required checks, pinned to GitHub Actions; squash merges only; linear history; no force pushes or deletion; no bypass list.
- Allow auto-merge, and delete branches on merge.
- Add the `RELEASE_TOKEN` secret.
- Dependabot checks npm and GitHub Actions weekly, with minor and patch updates grouped.

**Packaging (build.yml on the Windows runner).**

1. `npm ci`, then `npm run build` (Vite for the client, tsc for the server, into `dist/`). `scripts/package-win.ts` copies `dist/` and the package files into the zip's `app\` and runs `npm ci --omit=dev` there, so the workspace keeps Playwright for the package test.
2. Download the Node win-x64 zip for the version running the script (CI's, from `.nvmrc`) and verify it against `SHASUMS256.txt`. CI uses the same version, so the better-sqlite3, sharp and @napi-rs/canvas prebuilds match.
3. Copy `ffmpeg.exe` and `ffprobe.exe` from pinned npm packages into `bin\`, with their license files. (Added in PR 6, which first uses them.)
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

- The Reference folder's path is stored twice: absolute, and, if it's on the same drive as the app, relative to the app folder. At launch the absolute path is used if it's there (the app folder moved on its own), else the relative one (a USB drive under a new letter); if both exist, the absolute one wins, which PR 5 should confirm is the right root. If neither is there, the folder shows E3 with a link to point it somewhere else.
- Setup refuses a Reference folder that holds, or sits inside, the app folder or the data folder, so the app never writes into a root and uninstalling never deletes reference files.
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

**As built in PR 3.**

- `Morgue File.cmd` sets `MORGUE_HOME` to its own folder (the one holding `morgue-file.json` and `data\`) and runs the launcher; `config.ts` reads it. A development checkout has no launcher, so the repo is its own home folder (both files are git-ignored).
- Until the roots table arrives in PR 5, the Reference folder is saved in the data folder's `settings.json` beside the port (`referenceDirAbsolute`, plus `referenceDir` relative to the home folder when on the same drive). PR 5 seeds root 1 from it.
- A data folder missing at launch is looked for again on each page load, so plugging the drive back in and reloading is enough; the server then claims it as it would at launch.
- `src/server/install/` reads and writes the home and data folders, so it joins the files exempt from the `node:fs` import rule. It never touches a Reference root: setup checks and counts the Reference folder, and creates its `Inbox\`, through `originals.ts` (`inspectReferenceFolder`, `createInbox`).
- The lock file is `morgue-file.lock` in the data folder, holding the server's process id and port. A launch that finds a live owner answering `/healthz` opens a tab there; a lock left by a crash is ignored.
- Check and Save on the setup page post JSON from `src/client/setup-form.ts`, because writes need the `X-Morgue-Token` header, which a plain form can't send. Refusals come back as 400s whose `message` the page shows; the error handler now includes each AppError's message.
- The setup page's screenshot baselines (one per data choice) join the first baseline PR at the design gate, since no baseline exists before then. This departs from the design brief ("each gets its baseline approved in its own PR"); the gate message to Jim lists it.
- build.yml also runs on pull requests that touch packaging, `src/`, the build config, `.nvmrc` or the README, so the zip and the package test are proven before a release. The package test has its own Playwright config (`playwright.package.config.ts`) and installs to `C:\Temp\Morgue File tést\`. It sets up with a one-file Reference folder, opens Home and, since PR 7, the Photos Index page; moving it to the fixture archive is still to do. The hosted runner has one drive, so the move test moves the folder to a new path; a changed drive letter is covered by unit tests of the stored paths.
- README.html is rendered with `marked`, a dev dependency. `npm run check` and CI's lint-typecheck job run `scripts/check-readme.ts`.

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
| 16  | Viewer polish: viewing history, small page-strip thumbnails, the R21 timing test (PR 8 built zoom and pan, scrub, spreads and jump-to-page)                                 | 2          | R19, R21, R35      | A 300-page PDF shows page 1 in under 2 s                                                                                |
| 17  | Models: field settings with 30-day restore, profile editing (frame 14), model tagging, preview strips                                                                       | 2          | R14, R15, R16, R38 | 200 photos are linked to a model in one action                                                                          |
| 18  | Item fields UI: notes, source URL, rating                                                                                                                                   | 3          | R11                | A new field appears on every item page                                                                                  |
| 19  | Duplicate detection                                                                                                                                                         | 3          | R8                 | Re-importing a file links to the existing item                                                                          |
| 20  | HEIC, TIFF, WebM, PSD preview                                                                                                                                               | 3          | R7                 | Each format imports, gets a thumbnail and opens                                                                         |
| 21  | Model tags on page ranges                                                                                                                                                   | 3          | R17                | The profile opens the item at that page                                                                                 |
| 22  | Frame-exact video frame-step and loop range with requestVideoFrameCallback (PR 8 drew both, a few frames loose)                                                             | 3          | R20                | Frame-step works on MP4 and MOV                                                                                         |
| 23  | Compare board                                                                                                                                                               | 3          | R22                | The layout survives a restart                                                                                           |
| 24  | Backup and restore                                                                                                                                                          | 3          | R26                | A restore on a fresh install brings everything back                                                                     |
| 25  | 1.0 milestone: final P0 and P1 checks, README and release notes                                                                                                             | 3          | All P0 and P1      | Every P0 and P1 acceptance test passes on main and release-please cuts the release that contains them                   |

A PR is done when its row tests pass, CI is green, no screenshot changed (or the change was approved), and `docs/ARCHITECTURE.md` matches what was built.

## Risks and decisions

The biggest technical unknowns are PDF covers rendered in Node and how stable screenshots are on hosted runners. Both are tested early: PDF covers in PR 6, screenshots from PR 2.

| Risk                                                                                                              | Mitigation                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-side PDF covers (pdf.js with @napi-rs/canvas) fail on some files                                           | Spike it in PR 6. Fallback: the browser renders the cover the first time it's viewed and posts it back                                                                          |
| The page-folder rule as worded also matches photo folders such as `Figure/` (only numbered images, no subfolders) | PR 6 tightens it to files named by a number alone (`001.jpg`, as the fixture's page scans are) and tests it on the fixture                                                      |
| chokidar uses too many handles or too much memory on a large tree                                                 | Closed in PR 11: Node's recursive `fs.watch` replaced chokidar (one handle on Windows; see As built in PR 11). @parcel/watcher can still go behind `watchOriginals()` if needed |
| Screenshot diffs flake on hosted runners                                                                          | Windows fonts only, a frozen clock, GPU off, fonts and images loaded before capture. Baselines come only from the CI runner                                                     |
| A runner image update changes font rendering and fails every PR                                                   | Pin the runner to `windows-2025` rather than `windows-latest`, and refresh baselines on purpose when moving to a new image                                                      |
| The `baseline-approved` label is a weak control                                                                   | Agent rule 1 forbids adding it. If Claude Code pushes with Jim's GitHub credentials, GitHub can't tell who added the label; a separate bot account for the agent would fix that |
| Native modules don't match the bundled Node                                                                       | CI and packaging both read `.nvmrc`, and the smoke test launches the packaged app                                                                                               |
| Windows blocks the downloaded zip (Mark of the Web)                                                               | The README says to Unblock the zip before extracting it                                                                                                                         |
| Chromium can't play some video codecs                                                                             | Show the poster frame and a note; no transcoding in v1                                                                                                                          |

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
