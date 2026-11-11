// Names for files saved to the Inbox. Pure string work, kept out of originals.ts, which is only
// about reaching the file system.
import path from 'node:path';

/** Returns `name (n).ext`, the name a file is saved under when `name.ext` is taken. */
export function numberedName(fileName: string, number: number): string {
  if (number === 1) {
    return fileName;
  }
  const extension = path.extname(fileName);
  return `${fileName.slice(0, fileName.length - extension.length)} (${String(number)})${extension}`;
}
