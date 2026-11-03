// Draws the placeholder pictures: flat-shaded figures on color fields, and page scans of
// grey "lines of text". Nothing here resembles a real photo.
import sharp from 'sharp';

import { pickFrom, type Random, wholeNumberBetween } from './random.ts';

/** The four figure silhouettes the mocks use, in a 100×100 box: head center and body path. */
const POSES = [
  {
    headX: 50,
    headY: 22,
    body: 'M42 32 h16 l4 34 h-6 l-2 30 h-4 l-1 -26 h-2 l-1 26 h-4 l-2 -30 h-6 z',
  },
  { headX: 40, headY: 34, body: 'M33 44 h14 l3 24 h22 v8 h-8 v20 h-5 v-20 h-26 z' },
  { headX: 22, headY: 58, body: 'M30 55 h50 l8 10 v6 h-62 z' },
  { headX: 54, headY: 20, body: 'M46 30 h16 l2 30 h-4 l3 36 h-5 l-4 -30 l-4 30 h-5 l1 -36 h-4 z' },
] as const;

/** The warm and cool hues of the mocks' placeholder thumbnails. */
const HUES = [28, 35, 210, 18, 45, 195, 8, 32, 220, 40] as const;

/** The image formats the generator writes, by file extension. */
export type ImageFormat = 'jpg' | 'png' | 'webp' | 'gif';

/** A picture to draw: its pixel size and the generator that picks its colors and pose. */
export type Picture = { readonly width: number; readonly height: number; readonly random: Random };

/** Converts HSL (degrees, percent, percent) to a #rrggbb color, by the CSS Color 4 formula. */
export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const light = lightness / 100;
  const amount = (saturation / 100) * Math.min(light, 1 - light);
  function channel(offset: number): string {
    const position = (offset + hue / 30) % 12;
    const value = light - amount * Math.max(-1, Math.min(position - 3, 9 - position, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  }
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** SVG of a figure on a color field, scaled to the picture with the figure centered. */
export function figureSvg(picture: Picture): string {
  const { width, height, random } = picture;
  const hue = pickFrom(random, HUES);
  const saturation = wholeNumberBetween(random, 10, 27);
  const lightness = wholeNumberBetween(random, 62, 83);
  const pose = pickFrom(random, POSES);
  const side = Math.min(width, height);
  const ink = hslToHex(hue, saturation + 8, lightness - 34);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}">`,
    `<rect width="100%" height="100%" fill="${hslToHex(hue, saturation, lightness)}"/>`,
    `<svg x="${String((width - side) / 2)}" y="${String((height - side) / 2)}"`,
    ` width="${String(side)}" height="${String(side)}" viewBox="0 0 100 100">`,
    `<circle cx="${String(pose.headX)}" cy="${String(pose.headY)}" r="8" fill="${ink}"/>`,
    `<path d="${pose.body}" fill="${ink}"/></svg></svg>`,
  ].join('');
}

/** SVG of one scanned page: a cream sheet with grey bars for lines of text and a page number. */
export function pageSvg(picture: Picture, pageNumber: number): string {
  const { width, height, random } = picture;
  const margin = Math.round(width / 10);
  const lineHeight = Math.round(height / 40);
  const lines: string[] = [];
  for (let top = margin; top < height - margin * 1.5; top += lineHeight) {
    const lineWidth = width - 2 * margin - wholeNumberBetween(random, 0, margin * 2);
    lines.push(
      `<rect x="${String(margin)}" y="${String(top)}" width="${String(lineWidth)}"` +
        ` height="${String(Math.round(lineHeight / 3))}" fill="#9a968c"/>`,
    );
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}">`,
    `<rect width="100%" height="100%" fill="#f4f1ea"/>`,
    ...lines,
    `<text x="50%" y="${String(height - margin / 2)}" font-family="Arial" font-size="${String(lineHeight)}"`,
    ` text-anchor="middle" fill="#4c525c">${String(pageNumber)}</text></svg>`,
  ].join('');
}

/** SVG of a cover: the title in a dark band over a figure. */
export function coverSvg(picture: Picture, title: string): string {
  const figure = figureSvg(picture);
  const bandHeight = Math.round(picture.height / 6);
  const fontSize = Math.round(bandHeight / 4);
  const band =
    `<rect width="100%" height="${String(bandHeight)}" fill="#1c1f24"/>` +
    `<text x="${String(fontSize)}" y="${String(Math.round(bandHeight * 0.6))}" font-family="Arial"` +
    ` font-weight="bold" font-size="${String(fontSize)}" fill="#ffffff">${escapeXml(title)}</text>`;
  return figure.replace(/<\/svg>$/, `${band}</svg>`);
}

/** Escapes text for use inside SVG markup. */
function escapeXml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** Renders SVG markup to an image file's bytes in the given format. */
export async function renderSvg(svg: string, format: ImageFormat): Promise<Buffer> {
  const image = sharp(Buffer.from(svg));
  if (format === 'png') {
    return image.png().toBuffer();
  }
  if (format === 'webp') {
    return image.webp({ quality: 80 }).toBuffer();
  }
  if (format === 'gif') {
    return image.gif().toBuffer();
  }
  return image.jpeg({ quality: 82 }).toBuffer();
}
