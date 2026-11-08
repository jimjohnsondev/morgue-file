// R9, R10 and R37 in a browser: items are selected on an Index page by click, Shift-click and
// Ctrl+A, then tagged with suggestions as you type, put into collections, moved between them
// and filed, all from the action panel on the page (frame 13), with no dialog or new window.
// Runs on a small state server of its own, since it changes tags and collections.
import { expect, test } from '../support/shared-server-test.js';
import { startStateServerProcess, stopStateServer } from '../support/state-server-process.js';

import type { StateServer } from '../support/state-server-process.js';
import type { Locator, Page } from '@playwright/test';

/** A port of its own, apart from the shared server's and the other state servers'. */
const PORT = 47700;

let server: StateServer | undefined;

test.describe.configure({ mode: 'serial', timeout: 360_000 });

test.beforeAll(async () => {
  server = await startStateServerProcess('organize', PORT);
});

test.afterAll(async () => {
  await stopStateServer(server);
});

/** Fails the test if the page opens a dialog or a window (R37). */
function refuseDialogs(page: Page): void {
  page.on('dialog', () => {
    throw new Error('The page opened a dialog (R37).');
  });
  page.on('popup', () => {
    throw new Error('The page opened a window (R37).');
  });
}

/** The nth card in selection mode, counting from 1. */
function figureCard(page: Page, slot: number) {
  return page.locator('[data-select-card]').nth(slot - 1);
}

/** Clicks an action that reloads the page once saved, and waits for the reloaded page. */
async function clickAndReload(page: Page, button: Locator): Promise<void> {
  await Promise.all([page.waitForEvent('load'), button.click()]);
}

/** The action panel. */
function actionPanel(page: Page) {
  return page.getByRole('region', { name: 'Edit selected items' });
}

test('R10: a page of items is selected and tagged in one action, then a run is untagged', async ({
  page,
}) => {
  refuseDialogs(page);
  await page.goto(`${server!.url}/photos/figure`);
  await page.getByRole('link', { name: 'Select items to tag' }).click();
  const panel = actionPanel(page);
  await expect(panel.getByRole('heading')).toContainText('0 selected on this page');

  await page.keyboard.press('Control+a');
  await expect(panel.getByRole('heading')).toContainText('24 selected on this page');
  await panel.getByLabel('Tag', { exact: true }).fill('back-lit');
  await clickAndReload(page, panel.getByRole('button', { name: 'Add to 24' }));
  await expect(panel.getByRole('status')).toHaveText('Tagged 24 items.');
  // The page reloaded with the same items still selected.
  await expect(panel.getByRole('heading')).toContainText('24 selected on this page');
  await expect(panel.locator('.selection-tags')).toContainText('back-lit · 24');

  await panel.getByRole('button', { name: 'none' }).click();
  await figureCard(page, 2).locator('.thumb').click();
  await figureCard(page, 6)
    .locator('.thumb')
    .click({ modifiers: ['Shift'] });
  await expect(panel.getByRole('heading')).toContainText('5 selected on this page');
  await expect(figureCard(page, 4)).toHaveClass(/thumb-card--selected/);
  await expect(figureCard(page, 7)).not.toHaveClass(/thumb-card--selected/);

  const field = panel.getByLabel('Tag', { exact: true });
  await field.fill('ba');
  const suggestion = page.getByRole('option', { name: /back-lit/ });
  await expect(suggestion).toBeVisible();
  await expect(page.getByRole('option', { name: 'Create tag “ba” new' })).toBeVisible();
  await field.press('Enter');
  await expect(field).toHaveValue('back-lit');
  await clickAndReload(page, panel.getByRole('button', { name: 'Remove', exact: true }));
  await expect(panel.getByRole('status')).toHaveText('Took the tag off 5 items.');
  await expect(panel.locator('.selection-tags')).toBeHidden();
  await expect(page).toHaveURL(/select=on/);
});

test('R9: items are put in collections from the panel and moved between them', async ({ page }) => {
  refuseDialogs(page);
  await page.goto(`${server!.url}/photos/figure?select=on`);
  const panel = actionPanel(page);
  await figureCard(page, 1).locator('.thumb').click();
  await figureCard(page, 3)
    .locator('.thumb')
    .click({ modifiers: ['Shift'] });
  await panel.getByLabel('or new').fill('Spring model session');
  await clickAndReload(page, panel.getByRole('button', { name: 'Create' }));
  await expect(panel.getByRole('status')).toHaveText('Made the collection with 3 items.');
  await panel.getByLabel('or new').fill('Gouache palettes');
  await clickAndReload(page, panel.getByRole('button', { name: 'Create' }));
  await expect(panel.getByRole('status')).toHaveText('Made the collection with 3 items.');

  await page.goto(`${server!.url}/collections`);
  await page.getByRole('link', { name: 'Spring model session' }).first().click();
  await page.getByRole('link', { name: 'Select items to tag' }).click();
  await panel.getByRole('button', { name: /^all 3 in/ }).click();
  await expect(panel.getByRole('heading')).toContainText('All 3 in Spring model session selected');
  await clickAndReload(
    page,
    panel.getByRole('button', { name: 'Remove from Spring model session' }),
  );
  await expect(page.getByText('This collection is empty.')).toBeVisible();

  await page.goto(`${server!.url}/photos/figure`);
  await page.locator('.thumb-card .thumb').first().click();
  const collections = page.locator('.details-group', { hasText: 'Collections' });
  await expect(collections.getByRole('link', { name: 'Gouache palettes' })).toBeVisible();
  await expect(collections.getByRole('link', { name: 'Spring model session' })).toHaveCount(0);
  await collections.getByRole('button', { name: 'add to collection' }).click();
  await collections
    .getByLabel('Collection', { exact: true })
    .selectOption({ label: 'Spring model session' });
  await collections.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(collections.getByRole('link', { name: 'Spring model session' })).toBeVisible();
  await collections.getByRole('button', { name: 'Remove from Gouache palettes' }).click();
  await expect(collections.getByRole('link', { name: 'Gouache palettes' })).toHaveCount(0);
});

test('R10: the item page adds a tag with suggestions and takes it off with its [x]', async ({
  page,
}) => {
  refuseDialogs(page);
  await page.goto(`${server!.url}/photos/figure`);
  await page.locator('.thumb-card .thumb').nth(9).click();
  const tags = page.locator('.details-group', { hasText: 'Tags' });
  const field = tags.getByLabel('Add tag');
  await field.fill('back');
  await page.getByRole('option', { name: /back-lit/ }).click();
  await expect(field).toHaveValue('back-lit');
  await tags.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(tags.locator('.chip', { hasText: 'back-lit' })).toBeVisible();
  await tags.getByRole('button', { name: 'Remove tag back-lit' }).click();
  await expect(tags.locator('.chip', { hasText: 'back-lit' })).toHaveCount(0);
});

test('R5: Move to subcategory files the selection by hand, and it leaves the list', async ({
  page,
}) => {
  refuseDialogs(page);
  await page.goto(`${server!.url}/photos/figure?select=on`);
  const panel = actionPanel(page);
  const last = figureCard(page, 24);
  const name = (await last.locator('.thumb-card__label').textContent()) ?? '';
  await last.locator('.thumb').click();
  await panel.getByLabel('Move to subcategory').selectOption({ label: 'Unsorted' });
  await clickAndReload(page, panel.getByRole('button', { name: 'Move', exact: true }));
  await expect(panel.getByRole('status')).toHaveText('Filed 1 item.');
  await expect(page.locator('[data-select-card]')).toHaveCount(23);
  await expect(panel.getByRole('heading')).toContainText('0 selected on this page');
  await page.goto(`${server!.url}/unsorted`);
  await expect(page.locator('.thumb-card', { hasText: name })).toBeVisible();
});
