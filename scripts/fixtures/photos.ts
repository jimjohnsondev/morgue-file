// The 4,312 photos: Figure, Portrait and Hands in mapped folders, Drapery in a folder filed by
// hand, and 54 downloads waiting in the Inbox (Unsorted).
import { type FixtureFile, minutesAfter, padNumber } from './fixture-file.ts';

/** Generic photos are small; only frame 5's photo is made at full size. */
const LANDSCAPE = { width: 1008, height: 756 } as const;
const PORTRAIT = { width: 756, height: 1008 } as const;

/** Elena Varga's 211 numbered photos fill these slots onward in Figure, Hands and Portrait. */
const ELENA_FIRST_SLOT = 701;
const ELENA_PHOTO_COUNT = 211;

/** Frame 5's photo, third in Figure ("3 of 1,236 in Figure"). */
const FRAME_5_PHOTO = { folder: 'Figure', slot: 3, name: 'seated_backlit_017.jpg' } as const;

type PhotoFolder = {
  readonly folder: string;
  readonly prefix: string;
  readonly count: number;
  readonly firstDate: string;
  readonly stepMinutes: number;
};

/** Mapped folders. Portrait is newest, so Home's Recently added shows portrait_1488.jpg first. */
const MAPPED_FOLDERS: readonly PhotoFolder[] = [
  { folder: 'Figure', prefix: 'figure', count: 1236, firstDate: '2022-01-01', stepMinutes: 600 },
  { folder: 'Hands', prefix: 'hands', count: 902, firstDate: '2023-06-01', stepMinutes: 600 },
  {
    folder: 'Portrait',
    prefix: 'portrait',
    count: 1488,
    firstDate: '2025-06-22',
    stepMinutes: 480,
  },
];

/** Drapery lives in a folder no mapping covers; the seed files it by hand. */
const DRAPERY: PhotoFolder = {
  folder: 'Misc',
  prefix: 'drapery',
  count: 632,
  firstDate: '2021-02-01',
  stepMinutes: 720,
};

/** Every planned photo. */
export function planPhotos(): FixtureFile[] {
  const elenaBySubfolder = planElenaNames();
  const photos: FixtureFile[] = [];
  for (const folder of MAPPED_FOLDERS) {
    photos.push(...planMappedFolder(folder, elenaBySubfolder.get(folder.folder) ?? []));
  }
  photos.push(...planDrapery(), ...planDownloads());
  return photos;
}

/**
 * Names Elena's photos figure_elena_001.jpg to portrait_elena_211.jpg. The folder cycles every
 * three numbers so that 103, 106 and 109 land in Figure, Hands and Portrait, as frame 10 shows.
 */
function planElenaNames(): Map<string, string[]> {
  const folders = ['Figure', 'Hands', 'Portrait'] as const;
  const names = new Map<string, string[]>(folders.map((folder) => [folder, []]));
  for (let number = 1; number <= ELENA_PHOTO_COUNT; number++) {
    const folder = folders[Math.floor((number + 5) / 3) % 3] ?? 'Figure';
    names.get(folder)?.push(`${folder.toLowerCase()}_elena_${padNumber(number, 3)}.jpg`);
  }
  return names;
}

/** Fills slots 1 to count: frame 5's photo, then Elena's, then numbered photos in the rest. */
function planMappedFolder(folder: PhotoFolder, elenaNames: readonly string[]): FixtureFile[] {
  const photos: FixtureFile[] = [];
  for (let slot = 1; slot <= folder.count; slot++) {
    const elenaName = elenaNames[slot - ELENA_FIRST_SLOT];
    const isFrame5 = folder.folder === FRAME_5_PHOTO.folder && slot === FRAME_5_PHOTO.slot;
    const name = isFrame5
      ? FRAME_5_PHOTO.name
      : (elenaName ?? `${folder.prefix}_${padNumber(slot, 4)}.jpg`);
    const size = isFrame5 ? { width: 4032, height: 3024 } : sizeForSlot(slot);
    photos.push({
      relPath: `${folder.folder}/${name}`,
      kind: 'image',
      mtimeMs: minutesAfter(folder.firstDate, slot * folder.stepMinutes),
      ...size,
    });
  }
  return photos;
}

/** Two in three photos are landscape, matching the dimensions under frame 1's thumbnails. */
function sizeForSlot(slot: number): { width: number; height: number } {
  return (slot * 5) % 3 === 0 ? PORTRAIT : LANDSCAPE;
}

/** Drapery includes the other P0 image formats, so every format has a fixture. */
function planDrapery(): FixtureFile[] {
  const photos: FixtureFile[] = [];
  for (let number = 1; number <= DRAPERY.count; number++) {
    photos.push({
      relPath: `${DRAPERY.folder}/${DRAPERY.prefix}_${padNumber(number, 4)}.${extensionFor(number)}`,
      kind: 'image',
      mtimeMs: minutesAfter(DRAPERY.firstDate, number * DRAPERY.stepMinutes),
      ...sizeForSlot(number),
    });
  }
  return photos;
}

/** Most drapery photos are JPG; one in forty each is PNG, WebP or GIF. */
function extensionFor(number: number): string {
  const formats = new Map([
    [10, 'png'],
    [20, 'webp'],
    [30, 'gif'],
  ]);
  return formats.get(number % 40) ?? 'jpg';
}

/** download_001.jpg to download_054.jpg in the Inbox, waiting to be filed. */
function planDownloads(): FixtureFile[] {
  const photos: FixtureFile[] = [];
  for (let number = 1; number <= 54; number++) {
    photos.push({
      relPath: `Inbox/download_${padNumber(number, 3)}.jpg`,
      kind: 'image',
      mtimeMs: minutesAfter('2026-10-20', number * 240),
      ...sizeForSlot(number),
    });
  }
  return photos;
}
