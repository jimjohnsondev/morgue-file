// R2 in a browser: a file dropped or pasted onto any page is saved to the Inbox and listed in
// Unsorted, with the "Saved to Unsorted" notice (E6) linking to it; R8: a file the archive
// already has links to its item instead. Runs on a small state server of its own, since it adds
// files to the archive the server indexes.
import { readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '../support/shared-server-test.js';
import { startStateServerProcess, stopStateServer } from '../support/state-server-process.js';

import type { StateServer } from '../support/state-server-process.js';
import type { JSHandle, Page } from '@playwright/test';

/** A port of its own, apart from the shared server's and the other state servers'. */
const PORT = 47698;

/** The state server's Reference folder (see tests/support/start-state-server.ts). */
const REFERENCE_DIR = path.join(os.tmpdir(), 'morgue-file-state-ingest', 'Reference');

/** The full fixture archive, which holds Figure photos the state server's small copy doesn't. */
const FIXTURE_FIGURE_DIR = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  'fixtures',
  'generated',
  'Reference',
  'Figure',
);

let server: StateServer | undefined;
/**
 * Generated fixture photos' bytes, as base64, so dropped files make real thumbnails. Each test
 * drops a photo of its own that the archive doesn't hold yet, or it would be a copy (R8).
 */
let photosBase64: string[];
/** A photo the state server's archive already holds, in Figure. */
let keptPhoto: { readonly name: string; readonly base64: string };

test.describe.configure({ mode: 'serial', timeout: 360_000 });

/** Reads a file as base64. */
async function readBase64(file: string): Promise<string> {
  return (await readFile(file)).toString('base64');
}

test.beforeAll(async () => {
  server = await startStateServerProcess('ingest', PORT);
  // The small copy takes the first Figure photos by name, so the last ones are not in it.
  const unkept = (await readdir(FIXTURE_FIGURE_DIR)).sort().slice(-3);
  photosBase64 = await Promise.all(
    unkept.map(async (name) => readBase64(path.join(FIXTURE_FIGURE_DIR, name))),
  );
  const keptName = (await readdir(path.join(REFERENCE_DIR, 'Figure'))).sort()[0]!;
  keptPhoto = {
    name: keptName,
    base64: await readBase64(path.join(REFERENCE_DIR, 'Figure', keptName)),
  };
});

test.afterAll(async () => {
  await stopStateServer(server);
});

/** What a drop or paste carries in a test: a file, and the extra types a browser adds. */
type Carried = {
  readonly name: string;
  readonly base64: string;
  readonly type: string;
  readonly strings?: Readonly<Record<string, string>>;
};

/** Builds the DataTransfer a drop or paste of one file carries, inside the page. */
async function makeTransfer(page: Page, carried: Carried): Promise<JSHandle<DataTransfer>> {
  return page.evaluateHandle((file) => {
    const data = new DataTransfer();
    const bytes = Uint8Array.from(atob(file.base64), (character) => character.charCodeAt(0));
    data.items.add(new File([bytes], file.name, { type: file.type }));
    for (const [type, value] of Object.entries(file.strings ?? {})) {
      data.setData(type, value);
    }
    return data;
  }, carried);
}

/** Drags a transfer onto the page from outside and drops it, as Explorer or a browser does. */
async function drop(page: Page, dataTransfer: JSHandle<DataTransfer>): Promise<void> {
  for (const type of ['dragenter', 'dragover', 'drop']) {
    await page.dispatchEvent('main', type, { dataTransfer });
  }
}

/** Opens the item the "Saved to Unsorted" notice links to and returns its id. */
async function savedItemId(page: Page): Promise<string> {
  await expect(page).toHaveURL(/[?&]saved=\d+/);
  return new URL(page.url()).searchParams.get('saved')!;
}

test('R2: a file dropped on a page is saved to Unsorted and its notice links to it', async ({
  page,
}) => {
  await page.goto(`${server!.url}/photos/figure`);
  await drop(
    page,
    await makeTransfer(page, {
      name: 'hand_study.jpg',
      base64: photosBase64[0]!,
      type: 'image/jpeg',
    }),
  );

  const itemId = await savedItemId(page);
  expect(new URL(page.url()).pathname).toBe('/photos/figure');
  const notice = page.getByRole('status').filter({ hasText: 'Saved to Unsorted' });
  await expect(notice).toContainText('hand_study.jpg');
  await notice.getByRole('link', { name: 'go to Unsorted' }).click();
  await expect(page.locator(`.thumb-card__label[href^="/item/${itemId}"]`)).toContainText(
    'hand_study',
  );
  const month = (await readdir(path.join(REFERENCE_DIR, 'Inbox')))[0]!;
  expect(await readdir(path.join(REFERENCE_DIR, 'Inbox', month))).toContain('hand_study.jpg');
});

test('R2: browser drags keep the source URL when the browser provides it', async ({ page }) => {
  await page.goto(`${server!.url}/photos`);
  const transfer = await makeTransfer(page, {
    name: 'hand.jpg',
    base64: photosBase64[1]!,
    type: 'image/jpeg',
    strings: {
      'text/uri-list': 'https://example.com/studies/hand.jpg',
      'text/html': '<img src="https://example.com/studies/hand.jpg">',
    },
  });
  await drop(page, transfer);
  await savedItemId(page);
  await expect(page.getByRole('status').filter({ hasText: 'Saved to Unsorted' })).toContainText(
    'from example.com',
  );
});

test('R2: Ctrl+V pastes a picture from the clipboard into Unsorted', async ({ page }) => {
  await page.goto(`${server!.url}/`);
  const transfer = await makeTransfer(page, {
    name: 'image.png',
    base64: photosBase64[2]!,
    type: 'image/png',
  });
  await page.evaluate((clipboardData) => {
    document.body.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
    );
  }, transfer);
  await savedItemId(page);
  await expect(page.getByRole('status').filter({ hasText: 'Saved to Unsorted' })).toContainText(
    'image',
  );
});

test('R2: a file the archive does not keep is refused in the outline, and nothing saved', async ({
  page,
}) => {
  await page.goto(`${server!.url}/photos`);
  await drop(
    page,
    await makeTransfer(page, { name: 'notes.txt', base64: btoa('notes'), type: 'text/plain' }),
  );
  const outline = page.locator('[data-drop-outline]');
  await expect(outline).toContainText('Not saved');
  await expect(outline).toContainText("doesn't keep .txt files");
  await page.mouse.click(10, 10);
  await expect(outline).toBeHidden();
  await expect(page).toHaveURL(`${server!.url}/photos`);
});

test('R8: re-importing a file links to the existing item instead of copying it', async ({
  page,
}) => {
  await page.goto(`${server!.url}/photos`);
  await drop(
    page,
    await makeTransfer(page, {
      name: 'download.jpg',
      base64: keptPhoto.base64,
      type: 'image/jpeg',
    }),
  );
  const itemId = await savedItemId(page);
  expect(new URL(page.url()).searchParams.get('duplicate')).toBe('true');
  const notice = page.getByRole('status').filter({ hasText: 'Already in the archive' });
  await expect(notice).toContainText(keptPhoto.name);
  await notice.getByRole('link', { name: 'Open the item' }).click();
  await expect(page).toHaveURL(new RegExp(`/item/${itemId}$`));
  const month = (await readdir(path.join(REFERENCE_DIR, 'Inbox')))[0];
  const inbox = month === undefined ? [] : await readdir(path.join(REFERENCE_DIR, 'Inbox', month));
  expect(inbox).not.toContain('download.jpg');
});
