# Release notes: the 1.0 milestone

Morgue File reaches its 1.0 milestone with the first release after v1.24.0: every P0 and P1 row
of `docs/PRD.md` is built and has an acceptance test that passes. "1.0" names the milestone, not
the version number; versions have counted up from 1.0.0 since the first release (see "Version
numbers" in `docs/ARCHITECTURE.md`). `CHANGELOG.md` lists every change release by release.

## What's in it

- **Your files, where they are.** The Reference folder and any other watched folders are indexed
  in place and watched, so a new file shows up within 5 seconds (R1). Morgue File never changes,
  moves or deletes them (R3).
- **Drag, drop and paste** files or browser images into the Inbox, keeping the web address they
  came from (R2), and a file that is already in the archive is linked, not copied again (R8).
- **Photos, Video, Library and Models**, with subcategories, folder mappings and Unsorted (R4,
  R5), in JPG, PNG, WebP, GIF, HEIC, TIFF, PSD, MP4, MOV, WebM, PDF, CBZ and folders of page
  scans (R6, R7).
- **Organizing:** tags with suggestions, collections, and one action for a whole selection (R9,
  R10); rating, notes, source URL and fields of your own (R11, R36, R38); group-by on any list
  (R13).
- **Models:** profiles with fields of your own, model tags and a portrait (R14), linked to
  photos, videos, Library items and page ranges (R15, R17), with a strip per section (R16).
- **Browsing:** one paged Index template (R18), one Item template with zoom and pan, a video
  player with frame-step and loop (R19, R20), a page reader with spreads and a page strip (R21),
  the compare board (R22), a Home page of strips (R34) and viewing history (R35).
- **Search** over names, tags, collections, subcategories, notes and models, with filters, in
  under 200 ms at 50,000 items (R24).
- **Safety:** one-click backup and restore (R26), and a server only your own PC can reach (R27).
- **Install:** a portable zip with no installer or admin rights, a first-run page, and a README
  covering setup to uninstalling (R29, R30, R31).
- **Readable code** held to one style by the formatter and linter (R32, R33), and no pop-up
  windows or dialogs except the compare board (R37).

## How it is checked

`tests/unit/acceptance-coverage.test.ts` reads the PRD's table and fails if any P0 or P1 row has
no test named after it, so a row can't drop out of the suite unnoticed. Every pull request runs
the unit, integration, end-to-end, screenshot and performance tests on the Windows runner, and
the release build checks the zip itself.

## Not in 1.0

The P2 rows wait until the app is in real use: saved searches (R12), painter view tools (R23),
search by dominant color (R25) and an update notice (R28). Moving the data folder from Settings
isn't built; the README says how to move it by hand.
