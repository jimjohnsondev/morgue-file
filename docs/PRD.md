# Morgue File — PRD

Oct 31, 2026 · Jim Johnson

Repo copy of the project PRD. Live doc with rendered diagrams: https://claude.ai/artifact/3go4emxCPYsiayGYtXg7pv

## Overview

Morgue File is a personal web app, served at localhost on one Windows PC, that turns scattered reference photos, videos, books and magazines into a tagged, browsable archive with a profile page for each model, presented like an early-2000s online art gallery. It works offline, indexes files where they already live, never alters them, and ships through an automated GitHub pipeline, so Claude Code can build it end to end with one human checkpoint: design sign-off.

**The problem.** Reference material piles up across Downloads, phone exports, screenshots and social-media saves. The file browser can't tag or file one picture in two places. Photo managers organize by date and camera roll, not by subject. Cloud boards depend on someone else's service and feel like work software rather than a place you enjoy browsing.

The name comes from the illustrator's morgue file: the folder of clipped reference pictures artists have kept for a century.

## Goals and non-goals

v1 succeeds if finding a reference is faster than scrolling a folder, and nobody has to touch a build after the design is approved.

**Goals**

1. Find any reference in under 10 seconds by subject, tag or collection.
2. Get new material in with one gesture: drag, paste, or drop it in a watched folder.
3. Make browsing feel like visiting a personal gallery site, not using a file manager.
4. Build, test and release with zero manual steps after design sign-off.
5. Install in minutes on any Windows PC, and keep the code easy for a person to read and change.

**Non-goals for v1:** macOS, Linux or mobile builds; access from other devices; cloud sync; sharing or multiple users; Pinterest or Instagram imports; image editing; AI auto-tagging; and any commercial release.

**Success criteria**

| Measure                                 | Target                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| Archive size without slowdown           | 50,000 items                                                                       |
| Search results returned                 | under 200 ms at 50,000 items                                                       |
| First page of thumbnails on launch      | under 1 s                                                                          |
| Bulk import (index + thumbnails)        | 500 images in under 60 s                                                           |
| Merge to downloadable build             | under 30 min, no human steps                                                       |
| Human coding time after design sign-off | 0 hours (review optional)                                                          |
| First full index (about 1 TB)           | runs in the background, resumes after a restart; browsable within the first minute |
| Download to browsing the archive        | under 5 minutes, no command line                                                   |
| Lint and format issues on main          | 0                                                                                  |

## User and use cases

There is one user: a figurative painter working in short sessions around a full-time job, who needs the right reference on screen fast and enjoys browsing the collection for its own sake.

1. **Before painting:** pull up "hands, foreshortened" and set three or four references side by side next to the easel.
2. **Collecting:** drag an image out of a browser tab; it lands in Unsorted with its source URL.
3. **Bulk import:** point the app at a folder of photos from a model session and file them as a new collection.
4. **Model reference:** open a model's profile to see every photo, video and magazine feature they appear in.
5. **Reading:** flip through an anatomy book or an old magazine issue page by page.
6. **Browsing for ideas:** wander collections page by page, the way you'd explore an old art site.
7. **Video reference:** scrub a pose or timelapse video and step through it frame by frame.

## Feature requirements

The first release ships every P0 row; P1 rows land before 1.0, and P2 waits until the app is in real use. Each acceptance line is written so Claude Code can turn it directly into an automated test.

| #   | Area     | Requirement                                                                                                                                                                                                                      | Priority | Acceptance                                                                                                                                                           |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Files    | Watched folders: index in place, starting with the Reference folder at the secondary drive's root; pick up adds, moves and deletes                                                                                               | P0       | A file added to a watched folder appears within 5 s                                                                                                                  |
| 2   | Files    | Drag, drop or paste files, browser images or clipboard into the page; saved to an Inbox subfolder of the Reference folder                                                                                                        | P0       | Browser drags keep the source URL when the browser provides it                                                                                                       |
| 3   | Files    | Never modify originals; all metadata lives in the app database                                                                                                                                                                   | P0       | Source-file hashes are unchanged after every operation                                                                                                               |
| 4   | Files    | Sections: Photos, Video, Library and Models in the main nav; each file sits in exactly one media section                                                                                                                         | P0       | Every indexed file appears in exactly one of Photos, Video or Library                                                                                                |
| 5   | Files    | Subcategories: an editable list per section (Library starts with Books and Magazines); each item has exactly one; folders can map to a subcategory; anything without one shows in Unsorted                                       | P0       | A file dropped into a mapped folder lands in its subcategory with no manual filing                                                                                   |
| 6   | Files    | Formats: JPG, PNG, WebP, GIF, MP4, MOV, PDF, CBZ, folders of scanned pages                                                                                                                                                       | P0       | Each format imports, gets a thumbnail and opens in its viewer                                                                                                        |
| 7   | Files    | Formats: HEIC, TIFF, WebM, PSD preview                                                                                                                                                                                           | P1       | Same as row 6                                                                                                                                                        |
| 8   | Files    | Duplicate detection by file size plus a partial hash; full hash only to confirm a match                                                                                                                                          | P1       | Re-importing a file links to the existing item instead of copying it                                                                                                 |
| 9   | Organize | Collections: flat, hand-picked sets; an item can sit in many                                                                                                                                                                     | P0       | Moving an item between collections never moves the file on disk                                                                                                      |
| 10  | Organize | Tags with autocomplete; bulk-tag a selection                                                                                                                                                                                     | P0       | Tagging 200 selected items takes one action                                                                                                                          |
| 11  | Organize | Item fields: notes, source URL and 1–5 rating to start, in the same field system as models                                                                                                                                       | P1       | Fields are searchable, and a new field appears on every item page with no code change                                                                                |
| 12  | Organize | Saved searches (e.g. tag:hands rating:3+), listed beside collections                                                                                                                                                             | P2       | Contents update as items are tagged                                                                                                                                  |
| 13  | Organize | Group-by: any Index page can group by a field; Magazines groups issues by title                                                                                                                                                  | P1       | A title page lists its issues newest first                                                                                                                           |
| 14  | Models   | Model profiles: user-defined fields (name, bio, agency link, anything else; typed as text, long text, link, date, number or pick-list), model tags, and a portrait                                                               | P0       | Adding, renaming or removing a field in settings updates every profile with no code change; the portrait can be any photo in the archive                             |
| 15  | Models   | Tag photos, videos and Library items with one or more models; bulk-tag a selection                                                                                                                                               | P0       | Tagging 200 photos with a model takes one action                                                                                                                     |
| 16  | Models   | Profile previews: one strip per section with content, each linking to that section filtered by the model                                                                                                                         | P0       | A section with no content for the model shows no strip and no link                                                                                                   |
| 17  | Models   | Tag a page range in a Library item with a model                                                                                                                                                                                  | P1       | The profile's Library preview opens the item at that page                                                                                                            |
| 18  | Browse   | Index template: one paged grid page (« Prev 1 2 3 Next ») for every list in the app                                                                                                                                              | P0       | Any page of a 50,000-item archive renders in under 300 ms                                                                                                            |
| 19  | Browse   | Item template: one page for every item; the viewer slot holds an image (zoom and pan), video (play and scrub) or page reader                                                                                                     | P0       | Arrow keys move between items in the order of the Index you came from                                                                                                |
| 20  | Browse   | Video tools: frame-step, loop a range                                                                                                                                                                                            | P1       | Frame-step works on MP4 and MOV                                                                                                                                      |
| 21  | Browse   | Page reader for Library items: single page or spread, thumbnail strip, jump to page                                                                                                                                              | P0       | A 300-page PDF shows its first page in under 2 s                                                                                                                     |
| 22  | Browse   | Compare board: up to 4 references in a separate browser window                                                                                                                                                                   | P1       | The window remembers its layout between sessions                                                                                                                     |
| 23  | Browse   | Painter view tools: mirror, grayscale, value posterize, grid overlay                                                                                                                                                             | P2       | Toggles apply without altering the file                                                                                                                              |
| 24  | Find     | Search filename, tags, collections, subcategories, notes, and models with their fields and tags (model:Name); filter by section, subcategory, type, rating and model                                                             | P0       | Meets the 200 ms target at 50,000 items                                                                                                                              |
| 25  | Find     | Search by dominant color                                                                                                                                                                                                         | P2       | Picking a swatch returns items containing that color                                                                                                                 |
| 26  | Safety   | One-click backup and restore of the database as a zip                                                                                                                                                                            | P1       | Restoring on a fresh install brings back tags, collections, subcategories, notes and model profiles                                                                  |
| 27  | Safety   | Localhost only: the server binds 127.0.0.1 and rejects unexpected Host headers                                                                                                                                                   | P0       | A request from another device or a foreign web page is refused                                                                                                       |
| 28  | Safety   | Update notice when a new GitHub Release is out                                                                                                                                                                                   | P2       | The app links to the new version on launch                                                                                                                           |
| 29  | Install  | Portable: runs from any unzipped folder, including a USB drive, with no installer, admin rights or preinstalled software; setup offers to keep its data in a data folder beside it (the default) or in a folder the user chooses | P0       | The release zip runs on a clean Windows PC from a path with spaces, and, with the default data folder, still works after the folder is moved to another drive        |
| 30  | Install  | Easy setup: unzip, double-click Morgue File, then choose the Reference folder and where to keep the app's data on a first-run page                                                                                               | P0       | Download to browsing takes under 5 minutes with no command line; the first-run page rejects a Reference folder that doesn't exist or a data folder it can't write to |
| 31  | Install  | README with setup instructions: requirements, download, first run, shortcuts, updating, moving and backing up, uninstalling, troubleshooting                                                                                     | P0       | The release smoke test follows the README's setup steps on a clean runner, and a check fails if a required README section is missing                                 |
| 32  | Code     | Human-readable code: short functions and files, descriptive names, comments that explain why, no clever one-liners, no committed generated or minified code                                                                      | P0       | Lint limits on function length, file length, complexity and nesting pass on every PR; every exported function has a doc comment                                      |
| 33  | Code     | One code style and one way of doing each thing, written down in a style guide in the repo                                                                                                                                        | P0       | The formatter and linter report zero issues on every PR, and lint rules block the constructs the style guide rules out                                               |
| 34  | Browse   | Home page built from preview strips: pick up where you left off, recently added, waiting in Unsorted, collections, and random picks from the archive, with archive counts beside them                                            | P0       | Every strip links to its full list, and a strip with nothing to show is hidden                                                                                       |
| 35  | Browse   | Viewing history: remember the last items opened, with the video time or page reached                                                                                                                                             | P1       | Reopening an item from Home lands at the same video time or page                                                                                                     |
| 36  | Organize | Settings page: item and model fields, subcategories with folder mappings, and watched folders, each edited in a table                                                                                                            | P0       | Every change rows 1, 5 and 14 describe can be made from Settings, with no file or code edit                                                                          |
| 37  | Organize | Inline editing only: bulk actions, profile edits and settings change in place on the page, with no pop-up windows or modal dialogs                                                                                               | P0       | No page opens a modal dialog or a new window, except the compare board (row 22)                                                                                      |
| 38  | Organize | Removing a field hides it everywhere and keeps its values for 30 days, so it can be restored                                                                                                                                     | P1       | A field restored within 30 days shows its old values on every item or model                                                                                          |

## Sections

The archive has four sections: three by media type, plus Models for the people who appear in them. Within a section each item has one subcategory, while collections and tags cut across everything.

| Layer       | Set by                                                   | Per item    | Example                  |
| ----------- | -------------------------------------------------------- | ----------- | ------------------------ |
| Section     | File type, automatically                                 | Exactly one | Photos                   |
| Subcategory | A list you edit for each section; folders can map to one | Exactly one | Figure, Books, Magazines |
| Collection  | You, hand-picked                                         | Any number  | Spring model session     |
| Tag         | You, free-form                                           | Any number  | hands, foreshortened     |

| Section | Holds                            | Formats                                | Starting subcategories                                            | Opens in     |
| ------- | -------------------------------- | -------------------------------------- | ----------------------------------------------------------------- | ------------ |
| Photos  | Still images                     | JPG, PNG, WebP, GIF; HEIC, TIFF at P1  | Your own, e.g. Figure, Portrait, Hands                            | Image viewer |
| Video   | Pose videos, clips, timelapses   | MP4, MOV; WebM at P1                   | Your own, e.g. Poses, Timelapses                                  | Video player |
| Library | Books, magazines and other print | PDF, CBZ, folders of scanned pages     | Books (a shelf of covers), Magazines (title, then issues by date) | Page reader  |
| Models  | One profile per person who poses | Profile data only; no files of its own | None; models have their own tags                                  | Profile page |

**How files are sorted**

- **Section, by file type:** images go to Photos, video files to Video, and PDFs, CBZ files and page folders to Library.
- **Subcategory, by folder or by hand:** a folder can map to a subcategory (anything under a folder named Magazines lands in Magazines); one click moves an item, and anything unmatched waits in Unsorted.
- **Subcategory views:** the Index template can group by a field, which is how Magazines shows title, then issues by date; Books uses tall cover thumbnails.
- **Page folders:** a folder holding only numbered page images is treated as one publication, not as loose photos.

**Page templates**

The whole app is three page templates. Each one is designed once, built once and screenshot-tested once. Home is a stack of Model profile preview strips, and Settings and the edit forms reuse the same panels, tables and buttons, so neither adds a template.

| Template      | Used for                                                                                                                                            | What changes between uses                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Index         | Sections, subcategories, collections, tags, saved searches, search results, Unsorted, a model's "View all", and the lists of collections and models | The query behind it, the thumbnail shape (square, or tall for Library covers) and an optional group-by |
| Item          | Every photo, video and Library item                                                                                                                 | The viewer slot: image, video player or page reader                                                    |
| Model profile | Models                                                                                                                                              | The model's fields, plus preview strips that link to Index pages                                       |

- **Index:** breadcrumb, title, item count, filter bar and paged grid, always in that order.
- **Item:** Prev and Next step through whichever Index you came from; the details panel is identical for every item.
- **One field system:** items and models share it. Items start with notes, source URL and rating; models start with name and bio. You can add, rename or remove fields on either without a code change.
- **Saved searches:** any search can be saved with a name and listed beside collections, which replaces separate smart collections.
- **Unsorted:** new drops and anything without a subcategory share one view, which replaces a separate Inbox page.

**Model profiles**

- **Fields:** fields you define yourself (name, bio, agency link, anything else), each typed as short text, long text, link, date, number or a pick-list. Models also carry tags of their own, separate from item tags, and a portrait picked from any photo.
- **Linking:** tag photos, videos or whole publications with one or more models; in Library items, tag a page range (P1).
- **Profile page:** an "Appears in" line plus one preview strip per section with content, up to 6 items each, ending in "View all in \<section> »".
- **Empty sections:** a section with nothing for this model gets no strip and no link.
- **Search:** model:Name works everywhere, model fields and tags are searchable, and every section can filter by model.

_[Wireframe, model profile page: site banner and nav; breadcrumb Home › Models › Model name; portrait; your fields and tags; a highlighted "Appears in: Photos · Library" line; a Photos strip and a Library strip, each with up to 6 previews and "View all in … »"; Video is left out because nothing features this model.]_

Each strip and each "Appears in" link opens that section filtered to the model; here Video has nothing for them, so it doesn't appear. The wireframe shows what the page holds, not its final layout.

## Design direction

The app should feel like a personal gallery site from around 2002, made for a fullscreen 2560×1440 (16:9) monitor. The feel matters more than any one layout: Claude Design chooses the layout, and the design is approved against the principles below.

**The feel to keep**

- **Period web materials, lots of trim:** beveled tabs and buttons, framed panels with gradient title bars, matted thumbnails, hard offset shadows and a cyan-to-magenta trim strip. Text links are blue, turn purple once visited and underline on hover. No rounded corners, blur, soft shadows or animated transitions.
- **Cool gray with cyan and magenta:** the chrome is cool gray, and cyan and magenta are the only accents.
- **A big banner:** 240 px of abstract shapes behind a bold MORGUE FILE wordmark, with no photos or figurative art in it.
- **Pages, not feeds:** numbered pages, « Prev | Next », breadcrumbs and a tab bar. No infinite scroll.
- **Readable type, dense information:** Verdana or Arial at a 16 px base, sized for a large screen, with captions and counts under thumbnails and details in small tables.
- **A personal site, not a product:** a site banner, a footer counter ("4,312 images in 38 collections") and a "site last updated" line.
- **The images still lead:** viewers sit on neutral mid-gray and thumbnails on white mats, so the reference reads true.
- **Editing in place:** bulk actions, profile edits and settings change inline on the page. No pop-up windows or modal dialogs.
- **Style references:** early-2000s art-community and gallery sites, for mood only; the design copies none of them.

**Using the big screen**

- **Fill the screen:** grids run edge to edge, so one page holds far more thumbnails than an 800 px site ever did. Thumbnails come in a few fixed sizes, like the old "thumbnails per page" setting.
- **Sharp at 1440p:** thumbnails are made at twice their display size, and text and hairlines render crisply.
- **The viewer gets the space:** on the Item page the image, video or two-page spread takes most of the screen, and the details panel sits beside it and can be collapsed.
- **Room to work side by side:** the filter bar can stay open next to the grid, and the compare board shows up to 4 references at a useful size.
- **Viewing mode:** one key hides all chrome so a reference fills the screen while you paint, and the same key brings it back.
- **Still fine in a smaller window:** fewer columns, nothing broken.

**The design gate.** The approved mocks are on the design canvas (https://claude.ai/artifact/Lx5Ugcb9byevW6VEDJqd4g), and the design brief (`docs/DESIGN-BRIEF.md`) lists their screens, sample content and specs. Claude Code builds the three templates and Home against the CI fixture archive, which holds the same content as the mocks. Approving built frames 1–12 and the edge states next to the mocks is the one human checkpoint. The approved built screens, not the mocks, become the screenshot baseline, because a mockup and a browser render never match pixel for pixel. The editing screens (frames 13–15) get their baselines approved in the PRs that build them.

## Technical approach

The recommendation is a small Node.js server that serves the archive to your browser at localhost, with a SQLite database beside it. Everything runs on the Windows PC, and nothing listens beyond 127.0.0.1.

Implementation detail lives in `docs/ARCHITECTURE.md`.

| Layer           | Choice                                                                                                                                                                                                                                                                               | Why                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server          | Node.js LTS + TypeScript, Fastify                                                                                                                                                                                                                                                    | One language front to back; easy to test in CI                                                                                                                    |
| UI              | Server-rendered HTML and CSS with light TypeScript, built with Vite                                                                                                                                                                                                                  | The period look is simple markup, and paged links and prev/next come naturally                                                                                    |
| Data            | SQLite (better-sqlite3) with FTS5 full-text search                                                                                                                                                                                                                                   | One file, fast search, trivial to back up                                                                                                                         |
| Thumbnails      | sharp for images; bundled ffmpeg for video frames                                                                                                                                                                                                                                    | Generated once and cached                                                                                                                                         |
| Library items   | pdf.js for reading PDFs and rendering their covers; CBZ files read as zipped page images                                                                                                                                                                                             | One package handles both the reader and the cover thumbnails                                                                                                      |
| Folder watching | chokidar                                                                                                                                                                                                                                                                             | Picks up adds, moves and deletes in the Reference folder                                                                                                          |
| Storage         | Originals and Inbox stay in the Reference folder; library.db and thumbs live in a data folder beside the app by default, or in a folder chosen at setup                                                                                                                              | The reference folder stays clean, and the default keeps the app and its data together as one folder, while a chosen folder can sit on a bigger or backed-up drive |
| Network         | Binds 127.0.0.1 only; checks the Host header; no CORS                                                                                                                                                                                                                                | Other devices and websites can't reach the archive                                                                                                                |
| Launch          | Portable Windows zip with its own Node runtime; the first run asks for the Reference folder and where to keep data. A desktop and Start menu shortcut starts the server and opens the browser; if the server is already running, it just opens a new tab. No auto-start with Windows | No installer or admin rights needed                                                                                                                               |

Alternatives considered: a Tauri desktop app adds a native window a localhost tool doesn't need; a single Go binary is easier to ship but makes image and HEIC handling harder.

## Build and release pipeline

Every change reaches an installable build without a human: Claude Code works on a branch, CI gates the merge, and each merge to main cuts a versioned release.

_[Diagram, build and release pipeline: Claude Code opens a PR from a branch → CI checks (lint + typecheck, Vitest unit tests, Playwright e2e, screenshot diff vs design) → all green? If no, the failure report goes back and Claude Code fixes and pushes. If yes: auto-merge to main → release-please bumps version and changelog and tags vX.Y.Z → build the Windows zip (portable Node runtime) on windows-latest → GitHub Release with the zip attached (update notice at P2).]_

A red check never reaches main; the failure report goes back to Claude Code, which fixes and pushes again.

| Workflow    | Trigger            | What it does                                                                                                                               |
| ----------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| ci.yml      | every pull request | On windows-latest: lint, typecheck, Vitest, Playwright e2e in Chromium on a fixture archive, screenshot diff against the approved baseline |
| release.yml | push to main       | release-please bumps the version and changelog, then tags vX.Y.Z (its release PR is auto-merged)                                           |
| build.yml   | tag v\*            | Builds the Windows zip on windows-latest and attaches it to a GitHub Release                                                               |

- **Branch protection:** main requires the ci.yml checks, and auto-merge is on.
- **Agent rules:** Claude Code works only on branches and opens PRs; it never pushes to main.
- **Dependencies:** Dependabot opens weekly update PRs that pass through the same gate.
- **Test split:** Playwright drives the real app in Chromium against a fixture archive on Windows, so path and drive-letter handling are tested too.

The repo is public, so CI on standard GitHub-hosted runners costs nothing. That also means it holds only generated test images, never real reference files.

## Milestones

The pipeline comes first, so every later feature ships through it; design sign-off is the only gate that needs a person.

_[Diagram, roadmap (not to scale): Phase 0 Foundations (repo, CI and releases; templates + Home built; Claude Design mocks) → gate: Design sign-off (frames 1–12 + E1–E6 approved, then the CI visual baseline) → built autonomously by Claude Code: Phase 1 Archive core (watch folders + Inbox; collections, tags; Settings, bulk tagging) → Phase 2 Find and view (search and filters; video, page reader; profiles + editing) → Phase 3 Polish to 1.0 (backup, dedupe, notes; compare board, HEIC; 1.0 release) → v1.0 when all P0 + P1 rows pass.]_

Phase 0 runs the pipeline and design work side by side; no dates are set yet. P2 features (saved searches, color search, painter tools, auto-update) come after 1.0.

## Decisions and risks

Decided on Oct 31: Windows only, localhost only, files indexed in place, no Pinterest or Instagram imports, public GitHub repo, and a Reference folder of tens of thousands of files totaling about 1 TB, so targets assume 50,000 items. It launches by hand from a shortcut, never at Windows startup. No open questions remain; the biggest risk is still an autonomous build drifting from what was approved.

**Risks**

| Risk                                                                 | Mitigation                                                                                                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| The autonomous build drifts from the approved design                 | Screenshot diffs against the approved baseline (the built screens signed off against the mocks) block the merge                  |
| A change corrupts the database                                       | Migrations tested against a fixture database; automatic backup before any migration on launch                                    |
| Personal reference images or model details leak into the public repo | Tests use generated images only; app data lives outside the repo and is git-ignored                                              |
| Another device or a malicious web page reaches the local server      | Bind 127.0.0.1 only, reject unexpected Host headers, no CORS (requirement 27)                                                    |
| The secondary drive is unplugged or changes letter                   | The app marks the folder offline instead of deleting its items                                                                   |
| HEIC photos need a decoder the image package doesn't bundle          | HEIC held at P1; fall back to the bundled ffmpeg                                                                                 |
| Scope creep into painter tools or AI features                        | v1 is held to P0 and P1 rows                                                                                                     |
| The first index of about 1 TB takes hours, mostly video thumbnails   | Background, resumable indexing; thumbnails made newest-first and on demand for pages being viewed; no full-file hashing up front |
