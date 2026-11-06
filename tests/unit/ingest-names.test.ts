// How ingest names what it saves (R2): cleaned for Windows, named from a web address and its
// content type, and only fetched from public addresses (docs/ARCHITECTURE.md, Security).
import { describe, expect, it } from 'vitest';

import { cleanFileName, nameFetchedFile, requireKeptKind } from '#core/ingest/file-names.js';
import { inboxMonthFolder } from '#core/ingest/ingest.js';
import { isPublicAddress } from '#core/ingest/public-address.js';

describe('cleanFileName', () => {
  it.each([
    ['hand_study.jpg', 'hand_study.jpg'],
    ['C:\\Users\\Jim\\Desktop\\pose.png', 'pose.png'],
    ['../../Figure/pose.png', 'pose.png'],
    ['what: now?.jpg', 'what_ now_.jpg'],
    ['tab\there.gif', 'tab_here.gif'],
    ['trailing dots...', 'trailing dots'],
    ['con.jpg', 'con_.jpg'],
    ['LPT1', 'LPT1_'],
    ['.jpg', 'image.jpg'],
    ['', 'image'],
    ['???.png', 'image.png'],
    ['Études de mains.webp', 'Études de mains.webp'],
  ])('cleans %j to %j', (name, cleaned) => {
    expect(cleanFileName(name)).toBe(cleaned);
  });

  it('shortens a long name to 120 characters, keeping its extension', () => {
    const cleaned = cleanFileName(`${'a'.repeat(300)}.jpeg`);
    expect(cleaned).toHaveLength(120);
    expect(cleaned.endsWith('a.jpeg')).toBe(true);
  });
});

describe('requireKeptKind', () => {
  it('takes every P0 format and refuses the rest', () => {
    expect(requireKeptKind('a.JPG')).toBe('image');
    expect(requireKeptKind('a.mov')).toBe('video');
    expect(requireKeptKind('a.cbz')).toBe('cbz');
    expect(() => requireKeptKind('a.exe')).toThrow("doesn't keep .exe files");
    expect(() => requireKeptKind('image')).toThrow('without an extension');
  });
});

describe('nameFetchedFile', () => {
  function url(address: string): URL {
    return new URL(address);
  }

  it('keeps the name in the address when it matches the type sent', () => {
    expect(nameFetchedFile(url('https://example.com/a/hand%20study.jpg?w=2'), 'image/jpeg')).toBe(
      'hand study.jpg',
    );
    expect(nameFetchedFile(url('https://example.com/b/clip.MOV'), 'video/quicktime')).toBe(
      'clip.MOV',
    );
  });

  it("adds the type's extension to a name with none, or of another kind", () => {
    expect(nameFetchedFile(url('https://example.com/render'), 'image/webp; q=1')).toBe(
      'render.webp',
    );
    expect(nameFetchedFile(url('https://example.com/'), 'image/png')).toBe('image.png');
    expect(nameFetchedFile(url('https://example.com/page.php'), 'video/mp4')).toBe('page.mp4');
    expect(nameFetchedFile(url('https://example.com/%E0%A4%A.gif'), 'image/gif')).toBe(
      '%E0%A4%A.gif',
    );
  });

  it('refuses anything but the image and video types R6 keeps', () => {
    for (const type of ['text/html', 'image/svg+xml', 'application/pdf', undefined]) {
      expect(() => nameFetchedFile(url('https://example.com/a.jpg'), type)).toThrow(
        'not an image or video',
      );
    }
  });
});

describe('isPublicAddress', () => {
  it.each(['93.184.215.14', '8.8.8.8', '2606:2800:21f:cb07:6820:80da:af6b:8b2c'])(
    'lets %s through',
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );

  it.each([
    '127.0.0.1',
    '127.12.0.9',
    '0.0.0.0',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    'fd00::1',
    'fe80::1',
    'localhost',
  ])('refuses %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
});

describe('inboxMonthFolder', () => {
  it("names the month in the PC's own time", () => {
    expect(inboxMonthFolder(new Date(2026, 0, 31, 23, 59))).toBe('2026-01');
    expect(inboxMonthFolder(new Date(2026, 10, 6))).toBe('2026-11');
  });
});
