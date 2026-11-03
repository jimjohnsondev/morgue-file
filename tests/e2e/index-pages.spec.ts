// The gate build's Index frames render from the fixture archive (build plan row 7): frames 1–4
// and 11, with the design brief's sample names and counts.
import { expect, test } from '@playwright/test';

test('frame 1: Photos › Figure, page 3, with the filter panel open', async ({ page }) => {
  await page.goto('/photos/figure?page=3');
  await expect(page.locator('.breadcrumb')).toHaveText('Home › Photos › Figure');
  await expect(page.locator('.index-page__heading')).toContainText(
    '1,236 items · showing 193–288 · page 3 of 13',
  );
  await expect(page.locator('.thumb-card')).toHaveCount(96);
  await expect(page.locator('.thumb-card__label').first()).toHaveText('figure_0193.jpg');
  await expect(page.locator('.list-toolbar .pager').first()).toHaveText(
    /« Prev\s*1\s*2\s*3\s*4\s*5\s*…\s*13\s*Next »/,
  );
  await expect(page.getByRole('complementary', { name: 'Filters' })).toContainText(
    'Figure (1,236)',
  );
  await expect(page.locator('.tab--current')).toHaveText('Photos');
  await expect(page.locator('.tab-bar')).toContainText('Unsorted (54)');
  await expect(page.locator('.footer')).toContainText(
    '4,312 images · 186 videos · 74 publications in 38 collections',
  );
  await expect(page.locator('.footer')).toContainText('site last updated 31 Oct 2026');
});

test('frame 2: Library › Books, covers with the filter panel folded', async ({ page }) => {
  await page.goto('/library/books');
  await expect(page.locator('.index-page__heading')).toContainText('51 items');
  await expect(page.getByRole('complementary', { name: 'Filters' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '» show filters' })).toBeVisible();
  const cover = page.locator('.thumb-card--cover .thumb__image').first();
  expect(await cover.boundingBox()).toMatchObject({ width: 160, height: 232 });
});

test('frame 3: one magazine title, grouped by year, newest first', async ({ page }) => {
  await page.goto('/library/magazines/life-drawing-quarterly');
  await expect(page.locator('.index-page__heading')).toContainText(
    '12 issues · Spring 2021 to Winter 2023',
  );
  await expect(page.locator('.card-group__heading')).toHaveText([/^2023/, /^2022/, /^2021/]);
  await expect(page.locator('.thumb-card__label').first()).toHaveText('No. 12 · Winter 2023');
});

test('frame 4: search results for tag:hands model:Elena', async ({ page }) => {
  await page.goto('/search?q=tag%3Ahands+model%3AElena');
  await expect(page.locator('.page__title')).toHaveText('Search:tag:hands model:Elena');
  await expect(page.locator('.index-page__heading')).toContainText(
    '38 results · 34 in Photos, 4 in Library',
  );
  await expect(page.locator('.chip')).toHaveText([/tag: hands/, /model: Elena Varga/]);
  await page.getByRole('link', { name: 'Remove filter model: Elena Varga' }).click();
  await expect(page).toHaveURL('/search?q=tag%3Ahands');
});

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('the filter panel narrows the list', async ({ page }) => {
    await page.goto('/photos/figure');
    await page.getByRole('checkbox', { name: 'seated', exact: true }).check();
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page).toHaveURL('/search?q=in%3Aphotos+sub%3Afigure+tag%3Aseated');
    await expect(page.locator('.chip')).toHaveCount(3);
  });
});

test('frame 11: frame 1 at 1280×800 has fewer columns and nothing broken', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/photos/figure?page=3');
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(1280);
  const grid = page.locator('.thumb-grid');
  const columns = await grid.evaluate((element) => {
    const tops = [...element.children].map((child) => child.getBoundingClientRect().top);
    return tops.filter((top) => top === tops[0]).length;
  });
  expect(columns).toBeGreaterThan(2);
  expect(columns).toBeLessThan(12);
});

test('thumbnails are served by id once made', async ({ page }) => {
  await page.goto('/photos/figure');
  const src = await page.locator('.thumb__image').first().getAttribute('src');
  // The first request moves the thumbnail to the front of the queue; it is made moments later.
  await expect
    .poll(async () => (await page.request.get(src ?? '')).headers()['content-type'], {
      timeout: 60_000,
    })
    .toBe('image/webp');
});
