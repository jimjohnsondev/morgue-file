// The content type each original or page picture is served with, from its file extension.

/** Types of the files the viewers open (docs/ARCHITECTURE.md, Thumbnails and media). */
const TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  pdf: 'application/pdf',
  cbz: 'application/vnd.comicbook+zip',
};

/** The content type for a file name, or plain bytes for anything unexpected. */
export function mediaTypeOf(fileName: string): string {
  const extension = fileName.split('.').at(-1)?.toLowerCase() ?? '';
  return TYPES_BY_EXTENSION[extension] ?? 'application/octet-stream';
}
