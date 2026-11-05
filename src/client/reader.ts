// The page reader in the browser (frame 8, R21): draws a PDF's pages with pdf.js onto the
// canvases the server left for them, only the pages on show and the strip pages scrolled into
// view, so a long PDF opens at once. It also centres the strip on the pages shown, and PageUp
// and PageDown turn the pages.
import { followKeyLink, onPageKeys } from './keys.js';

import type { PDFDocumentProxy } from 'pdfjs-dist';

/** Loads pdf.js only on pages with a PDF, and points it at its worker. */
async function openPdf(url: string): Promise<PDFDocumentProxy> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  // Fetch only the byte ranges the pages on show need, so a 300-page PDF opens at once (R21).
  return pdfjs.getDocument({ url, disableAutoFetch: true, disableStream: true }).promise;
}

/**
 * The height a page is drawn for: the reader stage's inner height for the pages on show (CSS then
 * shrinks the page evenly if half the stage's width is tighter), or the strip page's own height.
 */
function targetHeight(canvas: HTMLCanvasElement): number {
  const stage = canvas.closest<HTMLElement>('.reader-stage');
  if (stage === null) {
    return canvas.getBoundingClientRect().height;
  }
  const style = getComputedStyle(stage);
  return stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
}

/**
 * Draws one PDF page onto its canvas, sharp on any screen. The canvas takes the page's own shape
 * from its drawing size, so the page is never stretched or squashed.
 */
async function drawPage(pdf: PDFDocumentProxy, canvas: HTMLCanvasElement): Promise<void> {
  const page = await pdf.getPage(Number(canvas.dataset.pdfPage));
  const natural = page.getViewport({ scale: 1 });
  const height = targetHeight(canvas) || natural.height;
  const viewport = page.getViewport({ scale: (height / natural.height) * window.devicePixelRatio });
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvas, viewport }).promise;
  canvas.dataset.drawn = 'true';
}

/** Draws the strip's pages as they scroll into view. */
function drawStripWhenSeen(pdf: PDFDocumentProxy, strip: HTMLElement): void {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && entry.target instanceof HTMLCanvasElement) {
        observer.unobserve(entry.target);
        void drawPage(pdf, entry.target);
      }
    }
  });
  for (const canvas of strip.querySelectorAll('canvas[data-pdf-page]')) {
    observer.observe(canvas);
  }
}

/** Opens the PDF and draws the pages on show, then the strip as it's seen. */
async function drawPdf(stage: HTMLElement, strip: HTMLElement | null): Promise<void> {
  const pdf = await openPdf(stage.dataset.readerSrc ?? '');
  const shown = [...stage.querySelectorAll<HTMLCanvasElement>('canvas[data-pdf-page]')];
  await Promise.all(shown.map((canvas) => drawPage(pdf, canvas)));
  stage.dataset.drawn = 'true';
  if (strip !== null) {
    drawStripWhenSeen(pdf, strip);
  }
}

/** Scrolls the strip, and only the strip, so the pages on show sit in its middle. */
function centreStrip(strip: HTMLElement): void {
  const current = strip.querySelector<HTMLElement>('[aria-current="page"]');
  if (current !== null) {
    strip.scrollLeft = current.offsetLeft - strip.clientWidth / 2 + current.offsetWidth / 2;
  }
}

const stage = document.querySelector<HTMLElement>('[data-reader]');
const strip = document.querySelector<HTMLElement>('.page-strip');
if (stage !== null) {
  if (strip !== null) {
    centreStrip(strip);
  }
  if (stage.dataset.readerSource === 'pdf') {
    drawPdf(stage, strip).catch((error: unknown) => {
      stage.dataset.drawn = 'failed';
      console.error('The PDF could not be drawn.', error);
    });
  }
  onPageKeys({
    PageUp: () => {
      followKeyLink('page-previous');
    },
    PageDown: () => {
      followKeyLink('page-next');
    },
  });
}
