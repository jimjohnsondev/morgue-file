// Turns the name a browser or a web address gives a file into one Windows can save in the Inbox,
// and names files that arrive without one (docs/ARCHITECTURE.md, Ingest).
import path from 'node:path';

import { classifyFile } from '#core/archive/classify.js';
import { AppError } from '#core/errors.js';

import type { FileKind } from '#core/archive/classify.js';

/** The longest name kept, in characters; Windows allows 255, and the Inbox path adds more. */
const MAX_NAME_LENGTH = 120;

/** What a file with no usable name is called: Chromium names a pasted screenshot `image.png`. */
const FALLBACK_STEM = 'image';

/** Characters Windows refuses in a file name, and control characters. */
const UNSAFE_CHARACTERS = /[<>:"/\\|?*\p{Cc}]/gu;

/** Names Windows reserves for devices, with or without an extension (`con.jpg` too). */
const RESERVED_STEMS = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** The extension each fetched content type is saved with: the kept image and video formats. */
const EXTENSION_BY_CONTENT_TYPE: ReadonlyMap<string, string> = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/heic', '.heic'],
  ['image/tiff', '.tif'],
  ['image/vnd.adobe.photoshop', '.psd'],
  ['video/mp4', '.mp4'],
  ['video/quicktime', '.mov'],
  ['video/webm', '.webm'],
]);

/** Shortens a name to the limit, keeping its extension. */
function shorten(stem: string, extension: string): string {
  return `${stem.slice(0, MAX_NAME_LENGTH - extension.length).trimEnd()}${extension}`;
}

/**
 * Cleans a file name for the Inbox: characters Windows refuses become `_`, leading dots and
 * trailing dots and spaces go (Windows drops them, so two names could collide), reserved device names get a `_`, and
 * long names are shortened, keeping the extension. Nothing of a path survives, only the last name.
 */
export function cleanFileName(name: string): string {
  const lastPart = name.split(/[/\\]/).at(-1) ?? '';
  const cleaned = lastPart
    .replaceAll(UNSAFE_CHARACTERS, '_')
    .trim()
    .replace(/[. ]+$/, '');
  // A name that is only an extension (`.jpg`) has none to Node; read it as if it had a stem.
  const extension = path.extname(`${FALLBACK_STEM}${cleaned}`);
  // Leading dots go too: the scanner skips a name starting with one as system clutter (macOS's
  // "._name.jpg"), so a file saved under it would never be indexed again.
  let stem = cleaned
    .slice(0, cleaned.length - extension.length)
    .replace(/^[.\s]+/, '')
    .trim();
  if (stem === '' || /^_+$/.test(stem)) {
    stem = FALLBACK_STEM;
  } else if (RESERVED_STEMS.test(stem)) {
    stem = `${stem}_`;
  }
  return shorten(stem, extension);
}

/**
 * Returns the kind of a file being saved, refusing one the archive doesn't keep: a dropped
 * `.txt` would sit in the Inbox unseen, since the scanner ignores it.
 */
export function requireKeptKind(fileName: string): FileKind {
  const kind = classifyFile(fileName);
  if (kind === undefined) {
    throw new AppError(
      'unsupported-file',
      `Morgue File doesn't keep ${path.extname(fileName) || 'files without an extension'} files.`,
    );
  }
  return kind;
}

/** The media type of a Content-Type header, without parameters, in lower case. */
function mediaTypeOf(contentType: string | undefined): string {
  return (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

/**
 * Names a file fetched from a web address: the last part of its path if that names a kept image
 * or video of the type the server sent, else that name (or `image`) with the type's extension.
 * Anything but the image and video types kept (R6, R7) is refused (docs/ARCHITECTURE.md, Security).
 */
export function nameFetchedFile(url: URL, contentType: string | undefined): string {
  const extension = EXTENSION_BY_CONTENT_TYPE.get(mediaTypeOf(contentType));
  if (extension === undefined) {
    throw new AppError(
      'unsupported-file',
      `${url.hostname} sent ${mediaTypeOf(contentType) || 'a file of no stated type'}, ` +
        'not an image or video Morgue File keeps.',
    );
  }
  let lastPart = url.pathname.split('/').at(-1) ?? '';
  try {
    lastPart = decodeURIComponent(lastPart);
  } catch {
    // A malformed escape is kept as written; cleaning still makes it a safe name.
  }
  const name = cleanFileName(lastPart);
  const sentKind = classifyFile(`${FALLBACK_STEM}${extension}`);
  if (classifyFile(name) === sentKind) {
    return name;
  }
  return cleanFileName(`${path.basename(name, path.extname(name))}${extension}`);
}
