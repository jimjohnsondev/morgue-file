// Writes the Library: PDFs of lorem pages with pdf-lib, CBZ files of page scans with yazl, and
// page folders of numbered page scans. Fixed dates keep the bytes the same on every run.
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { ZipFile } from 'yazl';

import { coverSvg, pageSvg, renderSvg } from './draw.ts';

import type { Random } from './random.ts';

/** Every date written inside a fixture file: the day the mocks were settled. */
const FIXED_DATE = new Date('2026-10-31T00:00:00Z');

/** Page scans are small, like a phone photo of a page shrunk for the web. */
const SCAN = { width: 560, height: 760 } as const;

/** A PDF page is 6×9 inches, a common trade-book size, in points. */
const PDF_PAGE = { width: 432, height: 648 } as const;

const LOREM = (
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut ' +
  'labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco'
).split(' ');

/** A publication to write: its title, page count, output path and random source. */
export type Publication = {
  readonly title: string;
  readonly pageCount: number;
  readonly outputPath: string;
  readonly random: Random;
};

/** Writes a PDF: a cover with the title, then pages of lorem text with page numbers. */
export async function writePdf(publication: Publication): Promise<void> {
  const document = await PDFDocument.create();
  document.setCreationDate(FIXED_DATE);
  document.setModificationDate(FIXED_DATE);
  document.setProducer('Morgue File fixture generator');
  document.setCreator('Morgue File fixture generator');
  const font = await document.embedFont(StandardFonts.Helvetica);
  const cover = document.addPage([PDF_PAGE.width, PDF_PAGE.height]);
  drawPdfCover(cover, font, publication.title);
  for (let pageNumber = 2; pageNumber <= publication.pageCount; pageNumber++) {
    const page = document.addPage([PDF_PAGE.width, PDF_PAGE.height]);
    drawPdfText(page, font, { pageNumber, random: publication.random });
  }
  await writeFile(publication.outputPath, await document.save());
}

/** Draws the cover: a dark band with the title over a plain figure. */
function drawPdfCover(page: PDFPage, font: PDFFont, title: string): void {
  page.drawRectangle({ x: 0, y: 0, ...PDF_PAGE, color: rgb(0.85, 0.79, 0.66) });
  page.drawRectangle({
    x: 0,
    y: PDF_PAGE.height - 90,
    width: PDF_PAGE.width,
    height: 90,
    color: rgb(0.11, 0.12, 0.14),
  });
  page.drawText(title, { x: 24, y: PDF_PAGE.height - 55, size: 16, font, color: rgb(1, 1, 1) });
  page.drawCircle({ x: 216, y: 380, size: 24, color: rgb(0.11, 0.12, 0.14) });
  page.drawSvgPath('M-24 0 h48 l12 102 h-18 l-6 90 h-12 l-3 -78 h-6 l-3 78 h-12 l-6 -90 h-18 z', {
    x: 216,
    y: 350,
    color: rgb(0.11, 0.12, 0.14),
  });
}

/** Draws about 30 lines of lorem text and the page number at the foot. */
function drawPdfText(
  page: PDFPage,
  font: PDFFont,
  options: { readonly pageNumber: number; readonly random: Random },
): void {
  for (let line = 0; line < 30; line++) {
    const words = Array.from(
      { length: 9 },
      () => LOREM[Math.floor(options.random() * LOREM.length)] ?? 'lorem',
    );
    page.drawText(words.join(' '), { x: 48, y: 590 - line * 17, size: 11, font });
  }
  page.drawText(String(options.pageNumber), { x: 210, y: 36, size: 10, font });
}

/** Renders page n of a scanned publication: the cover for page 1, text after that. */
async function renderScan(publication: Publication, pageNumber: number): Promise<Buffer> {
  const picture = { ...SCAN, random: publication.random };
  const svg =
    pageNumber === 1 ? coverSvg(picture, publication.title) : pageSvg(picture, pageNumber);
  return renderSvg(svg, 'jpg');
}

/** The name of page n inside a CBZ or page folder: just the number, as in 007.jpg. */
function scanName(pageNumber: number): string {
  return `${String(pageNumber).padStart(3, '0')}.jpg`;
}

/** Writes a CBZ: a zip of page scans, stored uncompressed, with fixed entry dates. */
export async function writeCbz(publication: Publication): Promise<void> {
  const zip = new ZipFile();
  const written = pipeline(zip.outputStream, createWriteStream(publication.outputPath));
  for (let pageNumber = 1; pageNumber <= publication.pageCount; pageNumber++) {
    const scan = await renderScan(publication, pageNumber);
    zip.addBuffer(scan, scanName(pageNumber), { mtime: FIXED_DATE, compress: false });
  }
  zip.end();
  await written;
}

/** Writes a page folder: one numbered page scan per file. */
export async function writePageFolder(publication: Publication): Promise<void> {
  await mkdir(publication.outputPath, { recursive: true });
  for (let pageNumber = 1; pageNumber <= publication.pageCount; pageNumber++) {
    const scan = await renderScan(publication, pageNumber);
    await writeFile(path.join(publication.outputPath, scanName(pageNumber)), scan);
  }
}
