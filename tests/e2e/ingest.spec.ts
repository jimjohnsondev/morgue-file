// R2 in a browser: a file dropped or pasted onto any page is saved to the Inbox and listed in
// Unsorted, with the "Saved to Unsorted" notice (E6) linking to it. Runs on a small state server
// of its own, since it adds files to the archive the server indexes.
import { readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { startStateServerProcess, stopStateServer } from '../support/state-server-process.js';

import type { StateServer } from '../support/state-server-process.js';
import type { JSHandle, Page } from '@playwright/test';

/** A port of its own, apart from the shared server's and the other state servers'. */
const PORT = 47698;

/** The state server's Reference folder (see tests/support/start-state-server.ts). */
const REFERENCE_DIR = path.join(os.tmpdir(), 'morgue-file-state-ingest', 'Reference');

let server: StateServer | undefined;
/** A generated fixture photo's bytes, as base64, so the dropped file makes a real thumbnail. */
let photoBase64: string;

test.describe.configure({ mode: 'serial', timeout: 360_000 });

test.beforeAll(async () => {
  server = await startStateServerProcess('ingest', PORT);
  const figure = path.join(REFERENCE_DIR, 'Figure');
  const photo = (await readdir(figure)).sort()[0]!;
  photoBase64 = (await readFile(path.join(figure, photo))).toString('base64');
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
    await makeTransfer(page, { name: 'hand_study.jpg', base64: photoBase64, type: 'image/jpeg' }),
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
    base64: photoBase64,
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
    base64: photoBase64,
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
