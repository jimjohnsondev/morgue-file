// R36 and R37 in a browser: Settings' tables are edited in place, with no dialog, and the item
// page's [move] files an item by hand. Runs on a small state server of its own, since it changes
// the library's subcategories.
import { expect, test } from '../support/shared-server-test.js';
import { startStateServerProcess, stopStateServer } from '../support/state-server-process.js';

import type { StateServer } from '../support/state-server-process.js';

/** A port of its own, apart from the shared server's and the other state servers'. */
const PORT = 47699;

let server: StateServer | undefined;

test.describe.configure({ mode: 'serial', timeout: 360_000 });

test.beforeAll(async () => {
  server = await startStateServerProcess('settings', PORT);
});

test.afterAll(async () => {
  await stopStateServer(server);
});

test('R36: a subcategory is added, renamed and given a folder from the Settings tables', async ({
  page,
}) => {
  page.on('dialog', () => {
    throw new Error('Settings opened a dialog (R37).');
  });
  await page.goto(`${server!.url}/settings`);
  const table = page.getByRole('region', { name: 'Subcategories' });
  await table.getByLabel('Section').selectOption('photos');
  await table.getByLabel('New subcategory name').fill('Drapery');
  await table.getByRole('button', { name: 'Add subcategory' }).click();
  await expect(table.getByRole('cell', { name: 'Drapery', exact: true })).toBeVisible();

  await table.getByRole('button', { name: 'Rename Drapery' }).click();
  const nameField = table.getByLabel('New name for Drapery');
  await expect(nameField).toBeFocused();
  await nameField.fill('Cloth');
  await table.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(table.getByRole('cell', { name: 'Cloth', exact: true })).toBeVisible();

  await table.getByRole('button', { name: 'Map a folder to Cloth' }).click();
  await table.getByLabel('Folder to map to Cloth').fill('Figure');
  await table.getByRole('button', { name: 'Map', exact: true }).click();
  await expect(table.getByText('is already mapped to Figure')).toBeVisible();
  await table.getByRole('button', { name: 'cancel', exact: true }).click();
  await expect(table.getByLabel('Folder to map to Cloth')).toBeHidden();

  await page.goto(`${server!.url}/photos/cloth`);
  await expect(page.getByRole('heading', { name: 'Cloth' })).toBeVisible();
});

test('R5: [move] on the item page files the item by hand, and E6’s "file it now" opens it', async ({
  page,
}) => {
  await page.goto(`${server!.url}/photos/figure`);
  await page.locator('.thumb-card a').first().click();
  await expect(page.getByRole('row', { name: /Subcategory/ })).toContainText('Figure');
  await page.getByRole('button', { name: 'move', exact: true }).click();
  await page.getByLabel('Subcategory').selectOption({ label: 'Cloth' });
  // Saving reloads the page; wait for it, since the open form's own choice already reads Cloth.
  const save = page
    .getByRole('form', { name: 'File this item' })
    .getByRole('button', { name: 'Save', exact: true });
  await Promise.all([page.waitForEvent('load'), save.click()]);
  await expect(page.getByRole('row', { name: /Subcategory/ })).toContainText('Cloth');

  await page.goto(`${page.url().split('?')[0]!}#filing`);
  await expect(page.getByLabel('Subcategory')).toBeVisible();
});

test('R36: a model field is added, renamed, removed and restored from the Fields table', async ({
  page,
}) => {
  page.on('dialog', () => {
    throw new Error('Settings opened a dialog (R37).');
  });
  await page.goto(`${server!.url}/settings`);
  const fields = page.getByRole('region', { name: 'Fields' });
  await fields.getByLabel('New model field name').fill('Agency');
  await fields.getByLabel('Type').last().selectOption({ label: 'link' });
  await fields.getByRole('button', { name: 'Add field' }).last().click();
  await expect(fields.getByRole('rowheader', { name: 'Agency', exact: true })).toBeVisible();

  await fields.getByRole('button', { name: 'Rename Agency' }).click();
  const nameField = fields.getByLabel('New name for Agency');
  await expect(nameField).toBeFocused();
  await nameField.fill('Agency link');
  await nameField.press('Enter');
  await expect(fields.getByRole('rowheader', { name: 'Agency link', exact: true })).toBeVisible();

  await fields.getByRole('button', { name: 'Move Agency link up' }).click();
  await expect(fields.getByRole('button', { name: 'Move Agency link down' })).toBeVisible();

  await fields.getByRole('button', { name: 'Remove Agency link' }).click();
  await expect(fields.getByText('Removed: Agency link, restorable until')).toBeVisible();
  await fields.getByRole('button', { name: 'Restore Agency link' }).click();
  await expect(fields.getByRole('rowheader', { name: 'Agency link', exact: true })).toBeVisible();
  await expect(fields.getByText('Removed:')).toBeHidden();
});
