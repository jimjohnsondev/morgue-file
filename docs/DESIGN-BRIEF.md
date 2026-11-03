# Morgue File — Design Brief

Oct 31, 2026 · Jim Johnson

Repo copy of the project design brief. Live doc: https://claude.ai/artifact/3MDQ5bdLnRshqMVBHYLZXD

## Purpose

The approved mocks are on the design canvas (https://claude.ai/artifact/Lx5Ugcb9byevW6VEDJqd4g): 15 frames plus six edge states, settled on 31 Oct 2026. This brief records what they show and the values behind them, so the built app and the fixture archive match the mocks. It adds detail to the PRD's Design direction.

How the design gate works:

1. The canvas is the design. Change it there first, then update this brief.
2. Claude Code builds the nav, the three templates and Home against the CI fixture archive, which holds the same content as the mocks.
3. **The gate:** you compare built frames 1–12 and E1–E6 with the mocks side by side and approve. This is the one human checkpoint before Phase 1.
4. CI saves the approved built screens as the Playwright baseline. From then on, any pixel change fails the PR unless a baseline update is approved explicitly.
5. Frames 13–15 (editing) are built in Phases 1 and 2. Each gets its baseline approved in the PR that builds it, the same way as the setup page.

The baseline comes from the built app, not the mocks, because a mockup and a browser render never match pixel for pixel. The mocks are what the build is judged against.

## Screens

There are 15 frames at 2560×1440, except frame 11 at 1280×800. Every frame has the banner, tab bar and footer except frame 9, viewing mode.

| #   | Screen                                       | Built from               | What it shows                                                                                                                                                                                     |
| --- | -------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Photos › Figure, page 3                      | Index                    | Square thumbnails at the default size, filter panel open, « Prev 1 2 **3** 4 5 … 13 Next », item count, breadcrumb                                                                                |
| 2   | Library › Books                              | Index                    | Tall cover thumbnails, filter panel collapsed                                                                                                                                                     |
| 3   | Library › Magazines › Life Drawing Quarterly | Index, grouped           | One title's issues, newest first, grouped by year                                                                                                                                                 |
| 4   | Search results: `tag:hands model:Elena`      | Index                    | The query echoed in the title, active filters as removable chips, result count                                                                                                                    |
| 5   | A photo                                      | Item                     | Image viewer with zoom controls; details panel open with field tables and tag, model and collection chips; « Prev · 3 of 1,236 in Figure · Next »                                                 |
| 6   | The same photo, panel collapsed              | Item                     | The viewer at full width; the panel folds to a thin edge with a « toggle                                                                                                                          |
| 7   | A pose video                                 | Item                     | Player with a scrub bar showing the loop range, timecodes, frame-step, loop in and out, speed and sound                                                                                           |
| 8   | A magazine issue, two-page spread            | Item                     | Page reader: spread view, page strip, jump-to-page, single or spread toggle                                                                                                                       |
| 9   | Viewing mode                                 | Item                     | Frame 5 with all chrome hidden, plus one small hint for the key that brings it back                                                                                                               |
| 10  | Elena Varga                                  | Model profile            | Portrait, fields, model tags, "Appears in: Photos (212) · Library (4)", a Photos strip and a Library strip, no Video strip                                                                        |
| 11  | Frame 1 at 1280×800                          | Index                    | The narrow-window check: fewer columns, nothing broken                                                                                                                                            |
| 12  | Home                                         | Model profile strips     | Five strips: Pick up where you left off, Recently added, Waiting in Unsorted, Collections, From the archive. A side column with archive counts and keys                                           |
| 13  | Select and tag                               | Index, selection mode    | Selected thumbnails framed in magenta with a ticked box. An action panel: select all or none; tag with suggestions as you type; add a model; add to or create a collection; move to a subcategory |
| 14  | Edit model profile                           | Model profile, edit mode | One row per field type, model-tag chips, a portrait chooser from the model's photos, Save and Cancel                                                                                              |
| 15  | Settings                                     | Panels and tables        | Fields on items and on models, subcategories with their mapped folders, watched folders                                                                                                           |

**No pop-ups.** All editing happens inline on the page; there are no pop-up windows or modal dialogs. The only thing that drops down is a suggestion list attached to its input.

## Sample content

Every mock uses this content, and Claude Code seeds the CI fixture archive with exactly the same names and counts. The repo is public, so all of it is invented: the people are fictional, and the images are generated placeholders (flat-shaded figures, color fields, page scans of lorem text), never real reference photos.

| Element               | Content                                                                                                                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site title            | MORGUE FILE (wordmark)                                                                                                                                                                                                                                         |
| Tagline               | reference archive of j m johnson                                                                                                                                                                                                                               |
| Nav                   | Home \| Photos \| Video \| Library \| Models \| Collections \| Unsorted (54) \| Search, with Settings at the right end                                                                                                                                         |
| Footer counter        | 4,312 images · 186 videos · 74 publications in 38 collections                                                                                                                                                                                                  |
| Footer line           | site last updated 31 Oct 2026                                                                                                                                                                                                                                  |
| Photos subcategories  | Figure (1,236), Portrait (1,488), Hands (902), Drapery (632), Unsorted (54); 4,312 in all                                                                                                                                                                      |
| Video subcategories   | Poses (140), Timelapses (46)                                                                                                                                                                                                                                   |
| Library subcategories | Books (51), Magazines (23 issues across 3 titles)                                                                                                                                                                                                              |
| Books                 | 51 titles made from "Studies in / Notes on / A Sketchbook of / Drawing" plus a subject (The Figure, Drapery, Hands …), vol. 2–4 after the first 13; 96–355 pages; PDF, CBZ or page folder                                                                      |
| Magazine title        | Life Drawing Quarterly: issues No. 1–12, Spring 2021 to Winter 2023; No. 12 (Winter 2023) has 72 pages                                                                                                                                                         |
| Collections           | Spring model session, Gouache palettes, Hands foreshortened, Old masters drapery, and 34 more                                                                                                                                                                  |
| Tags                  | hands, foreshortened, back-lit, seated, contrapposto, profile, three-quarter                                                                                                                                                                                   |
| Model                 | Elena Varga. Name; Bio "Dancer and life model. Best in long seated poses and strong back-lit setups."; Agency link (example.com); First session 2024-03-14; Sessions 6; Pose length Long (a demo pick-list: Short, Long, Both). Model tags: dancer, long poses |
| Elena's appearances   | 212 photos, 4 Library items, 0 videos. Library: LDQ No. 12 pages 12–19, LDQ No. 9 pages 30–35, Studies in Hands chapter 4, Notes on Gesture pages 88–95                                                                                                        |
| Photo item (frame 5)  | seated_backlit_017.jpg, 4032×3024, rating 4, tags hands · back-lit · seated, collection Spring model session, source URL on example.com                                                                                                                        |
| Video item (frame 7)  | pose_session_04_seated.mp4 in Poses (3 of 140), 1920×1080 at 30 fps, 3:15, rating 3, tags seated · three-quarter; playhead 0:42.12 (frame 1,264), loop 0:58.50–1:33.60                                                                                         |
| Search (frame 4)      | 38 results: 34 in Photos, 4 in Library                                                                                                                                                                                                                         |
| Selection (frame 13)  | 31 selected on page 3 of Figure                                                                                                                                                                                                                                |
| Folders               | Reference folder E:\Reference with Figure, Portrait, Hands, Video\Poses, Video\Timelapses, Books and Magazines mapped; Drapery filed by hand; Inbox at E:\Reference\Inbox; 4,572 items in all                                                                  |
| Unsorted files        | download_049.jpg to download_054.jpg                                                                                                                                                                                                                           |

Filenames, dates and counts in the mocks come from this table, so the fixture can reproduce them exactly.

## Fixed specs

These are the values on the approved canvas. Claude Code copies them into `tokens.css`, the only file allowed to hold colors and sizes.

| Spec                | Value                                                                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frame               | 2560×1440 CSS px at 100% Windows scaling (device scale 1); Chromium, maximized window                                                                                                                                                                                     |
| Typeface            | Verdana, then Arial, sans-serif, everywhere. Courier New for queries, timecodes and counters. No serif faces, no web fonts                                                                                                                                                |
| Type sizes          | Base 16 px (1 rem). Captions 13 px. Tables 14–15 px. Panel titles 14 px bold uppercase with 1 px letter-spacing. Page titles 24 px bold. Wordmark 52 px bold                                                                                                              |
| Chrome colors       | Page #C6CAD1, panels #E6E9EE, borders #101216, text #1C1F24, quiet text #4C525C, hairlines #9EA5B0. Tab bar #2B2F36 to #15171B, tabs #5A616D to #353A43, panel title bars #586070 to #343944                                                                              |
| Accents             | Cyan #12C6DE (title-bar squares), #9FF3FF (links on dark bars), #3CF0FF (counters). Magenta #D61F92 (selection, hover outline, loop range), #FF3DB8 (wordmark), #B0127A (link hover). Edit-mode title bar #B0127A to #5E0A42. Notice tints: cyan #EAFCFF, magenta #FFEAF6 |
| Links               | #0033CC, visited #663399, hover #B0127A underlined                                                                                                                                                                                                                        |
| Banner              | 240 px tall; one shared SVG of abstract shapes only (gradient bands, circles, rings, a dot field). Wordmark MORGUE in white and FILE in magenta with a 3 px hard shadow, tagline below; search box in a panel at the right                                                |
| Trim                | A 4 px strip running cyan, violet #7A6FE0, magenta, above the tabs and above the footer                                                                                                                                                                                   |
| Tabs                | Beveled; the current tab blends into the page; Settings sits at the right end                                                                                                                                                                                             |
| Panels              | 1 px dark border, 1 px white inner highlight, 2 px hard offset shadow #8E95A1; gradient title bar with an 8 px cyan square                                                                                                                                                |
| Buttons             | Beveled gradient #FAFBFC to #C6CAD1, light top-left and dark bottom-right edges, inset when pressed. Primary actions (Save) use a magenta gradient                                                                                                                        |
| Inputs              | 2 px inset border; cyan focus ring                                                                                                                                                                                                                                        |
| Thumbnails          | Square at Small 120, Medium 160 (default) and Large 240 px; Library covers 160×232. A 4 px white mat, 1 px border and 2 px shadow. Hover: magenta outline. Selected: 3 px magenta frame, pink fill, ticked box at top left. Files are generated at twice display size     |
| Thumbnails per page | 96 by default, as a setting (48, 96, 192). The grid runs edge to edge and wraps                                                                                                                                                                                           |
| Chips               | White, 1 px border, 1 px shadow; used for tags, models, collections and active filters                                                                                                                                                                                    |
| Footer              | Dark bar; counts in Courier New, cyan on black boxes                                                                                                                                                                                                                      |
| Corners, effects    | 0 px radius everywhere. Gradients and hard offset shadows only where listed here. No blur, soft shadows or transitions                                                                                                                                                    |
| Index layout        | Breadcrumb, title and count, then a 280 px filter panel beside the grid                                                                                                                                                                                                   |
| Item layout         | The viewer fills the space left of a 400 px details panel, which folds to a 34 px edge                                                                                                                                                                                    |
| Viewer background   | Neutral mid-gray #808080, so it doesn't skew judgments of value                                                                                                                                                                                                           |
| Editing             | Inline on the page only; no pop-ups or modal dialogs                                                                                                                                                                                                                      |
| Spacing             | Multiples of 4 px: 12 between thumbnails, 16–20 between panels, 24 page margin                                                                                                                                                                                            |

## Edge states

These are partial frames that show only the area that changes. They're quick to design now and hard to retrofit later. Each one is plain text in the site's voice, not an illustration.

| #   | State                  | Where                               | What it shows                                                                                                                                                    |
| --- | ---------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Empty Unsorted         | Index                               | "Nothing waiting to be filed." plus a line about dragging files in or using the Inbox folder                                                                     |
| E2  | Search with no results | Index                               | The query echoed back, "No items match", and links that drop each filter in turn                                                                                 |
| E3  | Drive offline          | Banner above any page               | "Reference folder (E:\Reference) is offline. 4,312 items are kept and will reappear when the drive is back." Thumbnails still show; opening an original shows E4 |
| E4  | Original missing       | Item viewer slot                    | The cached thumbnail enlarged, plus a note that the file can't be opened right now                                                                               |
| E5  | First index running    | Footer and a slim bar under the nav | "Indexing 12,400 of 48,000 files", with a link to pause. The rest of the page stays usable                                                                       |
| E6  | Drop in progress       | Any page                            | The outline that appears while a file is dragged over the page, and a "Saved to Unsorted" notice afterwards that links to the item                               |

## Out of scope and deliverables

**Not designed:** the compare board window, backup and restore, the first-run setup page, a viewing-history page, the collections list (an Index of covers), the P2 painter tools, color search and the update notice. Claude Code builds these from the approved parts, and each gets its baseline approved in its own PR.

**Design (done 31 Oct 2026):**

- [x] Frames 1–15 and E1–E6 on the design canvas
- [x] Final values recorded in Fixed specs
- [x] Banner artwork as one SVG on the canvas

**Claude Code then:**

- [x] Copies Fixed specs into `tokens.css` (done in the scaffold) and the banner SVG into `src/styles/` (copied from the canvas in PR 7)
- [ ] Builds the nav, three templates and Home against the fixture archive
- [ ] Posts built frames 1–12 and E1–E6 next to the mocks for the gate
- [ ] After approval, saves those screens as the CI baseline
- [ ] Builds frames 13–15 in their Phase 1 and 2 PRs, with baselines approved in each
