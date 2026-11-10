// The gate build's Model profile and Home frames render from the fixture archive (build plan
// row 9): frames 10 and 12, with the design brief's sample content (R16, R34).
import { expect, test } from '../support/shared-server-test.js';

test('frame 10: Elena Varga, with a Photos and a Library strip and no Video strip', async ({
  page,
}) => {
  await page.goto('/models');
  await page.locator('.thumb-card', { hasText: 'Elena Varga' }).locator('a').first().click();
  await expect(page.locator('.breadcrumb')).toHaveText('Home › Models › Elena Varga');
  await expect(page.locator('.tab--current')).toHaveText('Models');
  await expect(page.locator('.profile__appears')).toHaveText(
    'Appears in: Photos (212) · Library (4)',
  );
  await expect(page.locator('.profile__fields')).toContainText(
    'Dancer and life model. Best in long seated poses and strong back-lit setups.',
  );
  await expect(page.locator('.profile__fields')).toContainText('14 Mar 2024');
  await expect(page.locator('.profile__tags')).toContainText('dancer');
  await expect(page.locator('.profile__tags')).toContainText('long poses');
  const strips = page.locator('.preview-strip');
  await expect(strips).toHaveCount(2);
  await expect(strips.nth(0).locator('.panel__title')).toContainText('Photos · 212');
  await expect(strips.nth(1).locator('.panel__title')).toContainText('Library · 4');
  await expect(strips.nth(1)).toContainText('pages 12–19');
  await expect(page.getByRole('region', { name: 'Video featuring Elena Varga' })).toHaveCount(0);
});

test('R16: a profile strip links to its section filtered by the model', async ({ page }) => {
  await page.goto('/models/elena-varga');
  await page.getByRole('link', { name: 'View all 4 in Library »' }).click();
  await expect(page.locator('.page__title-query')).toHaveText('in:library model:"Elena Varga"');
  await expect(page.locator('.thumb-card')).toHaveCount(4);
});

test("R17: the profile's Library preview opens the item at that page", async ({ page }) => {
  await page.goto('/models/elena-varga');
  const library = page.getByRole('region', { name: 'Library featuring Elena Varga' });
  await library.locator('.thumb-card', { hasText: 'pages 12–19' }).locator('a').first().click();
  await expect(page).toHaveURL(/[?&]page=12(&|$)/);
  // The issue's page count arrives with its thumbnail job, so reload until the reader knows it.
  await expect(async () => {
    await page.reload();
    await expect(page.locator('.reader-nav')).toContainText('Pages 12–13 of 72', {
      timeout: 1000,
    });
  }).toPass({ timeout: 120_000 });
  await expect(page.locator('.breadcrumb')).toContainText('No. 12 · Winter 2023');
});

test('frame 12: Home with five strips and the archive counts', async ({ page }) => {
  await page.goto('/?shuffle=1');
  await expect(page.locator('.tab--current')).toHaveText('Home');
  await expect(page.locator('.preview-strip .panel__title > span')).toHaveText([
    'Pick up where you left off',
    'Recently added',
    'Waiting in Unsorted · 54',
    'Collections · 38',
    'From the archive',
  ]);
  const pickUp = page.getByRole('region', { name: 'Pick up where you left off' });
  await expect(pickUp.locator('.thumb-card').first()).toContainText('seated_backlit_017.jpg');
  await expect(pickUp).toContainText('at 0:42');
  await expect(page.getByRole('region', { name: 'Collections' })).toContainText(
    'Spring model session',
  );
  const counts = page.locator('.home__counts');
  await expect(counts).toContainText('4,312');
  await expect(counts).toContainText('186');
  await expect(counts).toContainText('74');
});

test('R34: every Home strip links to its full list', async ({ page }) => {
  await page.goto('/');
  for (const name of [
    'All recently viewed »',
    'View all recent »',
    'All 38 collections »',
    'More from the archive »',
  ]) {
    await page.getByRole('link', { name }).click();
    await expect(page.locator('.grid-panel .thumb-card').first()).toBeVisible();
    await page.goBack();
  }
  await page.getByRole('link', { name: 'File all 54 »' }).click();
  await expect(page.locator('.page__title')).toHaveText('Unsorted');
});
