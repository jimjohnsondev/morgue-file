// PDF covers: pdf.js (legacy build, for Node) renders page 1 onto an @napi-rs/canvas canvas.
import { createRequire } from 'node:module';
import path from 'node:path';

import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { cropToThumbnail } from './crop.js';

import type { ThumbnailResult } from './crop.js';
import type { ThumbnailSize } from '../thumbnail-files.js';

/**
 * pdf.js's copies of the 14 standard PDF fonts. PDFs that name Helvetica or Times without
 * embedding them, as most do, need these to draw their text.
 */
const STANDARD_FONTS_DIR =
  path.join(
    path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')),
    'standard_fonts',
  ) + path.sep;

/** Renders page 1 at a scale that covers the thumbnail, so cropping never scales it up. */
async function renderFirstPage(
  document: Awaited<ReturnType<typeof getDocument>['promise']>,
  size: ThumbnailSize,
): Promise<Buffer> {
  const page = await document.getPage(1);
  const natural = page.getViewport({ scale: 1 });
  const scale = Math.max(size.width / natural.width, size.height / natural.height);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  // pdf.js only calls getContext('2d') on it, which @napi-rs/canvas provides.
  const canvasElement = canvas as unknown as HTMLCanvasElement;
  await page.render({ canvas: canvasElement, viewport }).promise;
  return canvas.encode('png');
}

/** Makes a PDF's cover from page 1 and counts its pages. */
export async function makePdfThumbnail(pdf: Buffer, size: ThumbnailSize): Promise<ThumbnailResult> {
  const loading = getDocument({
    data: new Uint8Array(pdf),
    standardFontDataUrl: STANDARD_FONTS_DIR,
    verbosity: 0,
  });
  try {
    const document = await loading.promise;
    const cover = await renderFirstPage(document, size);
    return {
      webp: await cropToThumbnail(cover, size),
      details: { pageCount: document.numPages },
    };
  } finally {
    await loading.destroy();
  }
}
