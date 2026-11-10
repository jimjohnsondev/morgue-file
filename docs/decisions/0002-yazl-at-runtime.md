# 0002: yazl writes backup zips at run time

Date: 2026-11-10 · PR 24 (backup and restore)

## Context

R26 asks for a one-click backup of the database as a zip. The architecture names yauzl, which
reads zips, as a runtime dependency, but nothing that writes them. yazl, by the same author, was
already a dev dependency: the fixture generator zips CBZ files with it.

## Decision

Move yazl (MIT, with one small dependency of its own, buffer-crc32) from
`devDependencies` to `dependencies`. `core/backup/backup-zip.ts` uses it to stream a zip of a
`VACUUM INTO` copy of library.db, with a short JSON note, straight to the browser. Restores read
the zip with yauzl, as CBZ pages are read.

## Consequences

The packaged app gains a few kilobytes. Writing a zip by hand (local headers, CRC-32, the central
directory, ZIP64 for libraries over 4 GB) would have been more code to get wrong than one small,
well-used library. Revisit only if yazl stops being maintained.
