# Morgue File

A personal reference archive for painters.

## What it is

Morgue File turns a folder of reference photos, videos, books and magazines into a tagged,
browsable gallery with a profile page for each model, styled like an early-2000s art site. It runs
on your own Windows PC in your web browser, works offline, and never changes your files. Only your
own PC can open it.

Every feature planned for its first full release is in: watched folders, drag and drop, the
Photos, Video, Library and Models pages, tags, collections, model profiles, search, the page
reader and video tools, the compare board, and backup and restore.

## Requirements

- A 64-bit Windows 10 or 11 PC. You don't need admin rights or anything else installed.
- Microsoft Edge or Google Chrome.
- Disk space for the app's data folder (its database and thumbnails), which grows with your
  archive. Plan on a few gigabytes for a large one.

## Install

1. Open the [Releases page](https://github.com/jimjohnsondev/morgue-file/releases) and download
   the newest `MorgueFile-<version>-win-x64.zip`.
2. Right-click the downloaded zip and choose **Properties**.
3. If you see an **Unblock** box at the bottom, tick it and click **OK**. (Windows marks files
   from the internet; unblocking stops it warning you every time Morgue File starts.)
4. Right-click the zip, choose **Extract All…**, and pick where Morgue File should live, for
   example `C:\Users\<you>\Morgue File` or a USB drive. Any folder works, even one with spaces in
   its name.
5. Open the extracted **MorgueFile** folder.
6. Optional: double-click **Install shortcuts**. It adds Morgue File to your Desktop and Start
   menu.

## First run

1. Double-click **Morgue File** (or its shortcut). A small window titled "Morgue File server"
   opens, and your browser opens the setup page.
2. Under **Reference folder**, type the full path of the folder that holds your reference files,
   such as `E:\Reference`. If `E:\Reference` exists, it's filled in for you.
3. Click **Check**. Morgue File says how many files it found there. If the folder doesn't exist
   or can't be read, it says so; fix the path and click **Check** again.
4. Under **Where to keep data**, choose one:
   - **Keep data with the app** (the usual choice). The data goes in a `data` folder beside the
     app, so everything stays in one folder you can move or back up.
   - **Use a folder I choose**, for example on a bigger or backed-up drive. Type the folder's
     path and click **Check**. If that folder already holds a Morgue File library, it is used, not
     replaced.
5. Click **Save**. Morgue File creates an `Inbox` folder inside your Reference folder and opens
   your archive.

The first index of a large archive runs in the background, and you can browse while it works. If
you close Morgue File, it carries on where it stopped next time.

## Everyday use

- **Start:** double-click **Morgue File** or its shortcut. If it's already running, this just
  opens a new browser tab.
- **Stop:** close the "Morgue File server" window. Keep it open, minimized if you like, while you
  use Morgue File.
- **Adding files:** put them anywhere in your Reference folder. Files you drag or paste into the
  app are saved in the `Inbox` folder inside it, sorted by month.
- Morgue File never changes, moves or deletes your files. Tags, collections and notes live in its
  own database.
- **Filing:** every photo, video and Library item has one subcategory, such as Figure or Books.
  In **Settings**, map a folder to a subcategory (type `E:\Reference\Figure`, or just `Figure`)
  and everything in it, now and later, files itself there. Anything else waits in **Unsorted**.
  To file one item by hand, click **[move]** beside its subcategory on the item's page; it then
  stays where you put it. Removing a subcategory moves its items to Unsorted, never on disk.
- **File types:** photos in JPG, PNG, WebP, GIF, HEIC, TIFF and PSD; videos in MP4, MOV and
  WebM; PDF and CBZ files and folders of numbered page scans. Anything else in the Reference
  folder is left out. A PSD shows the flattened picture Photoshop saves with **Maximize
  compatibility** turned on (its default), never the separate layers.
- **More folders:** under **Settings → Watched folders**, add another folder, such as
  `D:\Phone exports`. It is indexed and watched like the Reference folder.
- **Compare board:** on any item's page, click **add to compare board** to put it side by side
  with up to three others in a window of its own. Choose **side by side** or **2 × 2 grid** at
  the top of that window, and **[remove]** under a reference to make room. The board keeps its
  references, layout, size and place on screen until you change them, even after a restart. If
  your browser blocks the window, allow pop-ups for Morgue File's address.

- **Browsing:** the tabs at the top lead to Home, Photos, Video, Library, Models and Settings.
  Home picks up where you left off, and shows what was added lately, what waits in Unsorted,
  your collections and a few random picks. Every list is pages of thumbnails with « Prev and
  Next; the filter panel above it narrows the list and can group it, by rating or a field.
- **Viewing:** click a thumbnail to open it. Photos zoom with **−**, **+**, 100% and 200%, and
  pan by dragging. Videos play and scrub, step one frame at a time, and loop a range. Books and
  magazines open in a page reader, a page or a spread at a time, with a strip of pages to jump
  to. **←** and **→** move to the previous and next item of the list you came from, and **V**
  turns viewing mode (the picture alone) on and off. A video or book you reopen from Home starts
  at the time or page you reached.
- **Tags and collections:** on an item's page, type a tag under its details; suggestions appear
  as you type. To tag many at once, click **Select items to tag** above a list, tick thumbnails
  (Shift-click ticks a run, Ctrl+A the page, or choose the whole list), then tag them, add them
  to a collection, file them in a subcategory or link them to a model in one go. Collections
  hold whatever you pick, and an item can sit in many; nothing moves on disk.
- **Models:** each model has a profile page with a portrait, fields such as name, bio and
  agency link, model tags, and a strip of their photos, videos and Library items. Link items to a
  model with **add model** on the item's page, or from the selection panel. In the page reader,
  **add model to pages** links just the pages on show, and the profile opens the book there.
- **Notes, rating and other fields:** an item's details hold its rating, source URL and notes,
  each changed in place with **[change]**. Notes save as you leave the box. Add, rename, reorder
  or remove fields for items and models under **Settings → Fields**; a removed field and its
  values can be restored for 30 days.
- **Searching:** type in the search box at the top. Words match file names, tags, collections,
  subcategories, notes and models. Narrow a search with terms such as `tag:hands`,
  `model:Elena`, `in:photos`, `sub:figure`, `type:pdf`, `rating:3+` or `-tag:drapery`; each term
  shows above the results with a link to remove it. **search tips**, linked from a search that
  finds nothing, lists every term.
- **Drag and drop:** drop files, or an image from another browser tab, anywhere on a page, or
  paste one with Ctrl+V. They are saved in the Inbox, with the web address they came from. A
  file that is already in the archive isn't copied again; Morgue File opens the one it has.

## Update

1. Close the "Morgue File server" window.
2. Download and unblock the new zip, as in Install steps 1–3.
3. Extract it into the folder that holds your current **MorgueFile** folder, and choose to
   replace the files when Windows asks.

Your settings (`morgue-file.json`) and your `data` folder aren't in the zip, so they stay as they
are. Before its first launch after an update, Morgue File backs up its database.

## Move or back up

- **With Keep data with the app:** close Morgue File, then copy or move the whole **MorgueFile**
  folder. Everything comes with it. On a USB drive it works under any drive letter.
- **With a folder you chose:** move the **MorgueFile** folder freely; your data stays where it
  is. To move the data too, close Morgue File, move the data folder, then start Morgue File. It
  says it can't find its data folder and shows the setup page. Check your Reference folder,
  choose **Use a folder I choose**, type where the data is now, click **Check**, then **Save**.
  The library there is used, not replaced.
- **Backing up the library:** open **Settings**, then click **Back up now** under Backup and
  restore. Your browser saves a zip named like `MorgueFile-backup-2026-11-10T14-32-05Z.zip`. It
  holds your tags, collections, subcategories, fields, notes, model profiles and settings, but not
  the files in your Reference folder or their thumbnails. Keep it somewhere other than this PC.
- **Restoring a backup:**
  1. Open **Settings** and find Backup and restore.
  2. Click **Choose File** next to "Restore from a backup", and pick the backup zip.
  3. Click **Restore**. Morgue File replaces the whole library with the backup's, then opens Home.
     The library as it was is first copied to the `backups` folder inside the data folder.

  On a new PC, install Morgue File and finish First run with your Reference folder, then restore.
  Thumbnails are made again as you browse.

- **Backing up everything:** copy the **MorgueFile** folder (and your chosen data folder, if you
  use one) while Morgue File is closed.

## Uninstall

1. Close the "Morgue File server" window.
2. Delete the **MorgueFile** folder.
3. Delete the Morgue File shortcuts from your Desktop and Start menu, if you added them.
4. If you chose your own data folder, delete it too.

Your Reference folder and its files are never touched; delete its `Inbox` folder only if you want
to.

## Troubleshooting

- **Windows says it protected your PC:** the zip wasn't unblocked. Click **More info**, then
  **Run anyway**, or delete the folder and repeat Install steps 2–4.
- **The browser doesn't open:** go to `http://127.0.0.1:47613/` yourself. The "Morgue File
  server" window shows the address it is using.
- **Port in use:** if another program uses port 47613, Morgue File tries 47614 up to 47622 and
  remembers the one it got. If all of them are busy, the server window says so; close the other
  program and start Morgue File again.
- **The page says it can't find the data folder:** the drive holding it is probably unplugged.
  Plug it in and reload the page, or point Morgue File to where the data is now.
- **The Reference folder's drive is offline:** your items are kept and come back when the drive
  does. If the drive now has a new letter, or you moved the folder, open **Settings → Watched
  folders**, click **change location** and type where it is now. Nothing is indexed again.
- **A video won't play:** your browser can't play that video format (some MOV and HEVC files).
  Morgue File shows a still frame from it instead.

## For developers

You need Node.js 24 (see `.nvmrc`).

```sh
git clone https://github.com/jimjohnsondev/morgue-file.git
cd morgue-file
npm ci
npm run dev       # builds, then serves http://127.0.0.1:47613 (the repo is its home folder)
npm run check     # format, lint, README sections, typecheck and tests
npm run test:e2e  # Playwright end-to-end tests in Chromium
npm run fixtures  # makes the invented test archive in fixtures/generated/ (about 2 minutes)
```

`npm run package` builds the Windows zip into `release/`; it runs on Windows only.

- `docs/PRD.md` — what the app does, with numbered requirements
- `docs/DESIGN-BRIEF.md` — what it looks like, with the exact design values
- `docs/ARCHITECTURE.md` — how it is built, and the build plan
- `docs/STYLE.md` — how the code is written
- `docs/RELEASE-NOTES.md` — what the 1.0 milestone holds, and what waits for later
- `CLAUDE.md` — instructions for Claude Code, which builds this repo through pull requests

## License

MIT
