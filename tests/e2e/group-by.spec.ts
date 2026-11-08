// R13 in a browser on the fixture archive: the filter panel's Group by gathers Figure by rating,
// and E2's "search tips" opens the query language.
import { expect, test } from '../support/shared-server-test.js';

test('R13: Group by in the filter panel gathers a list under one heading per value', async ({
  page,
}) => {
  await page.goto('/photos/figure');
  await page.locator('#filter-group').selectOption('rating');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page).toHaveURL('/search?q=in%3Aphotos+sub%3Afigure+group%3Arating');
  const headings = page.locator('.card-group__heading');
  await expect(headings.first()).toContainText(/^Rating: \d/);
  await expect(headings.last()).toContainText('No rating');
  await expect(page.locator('#filter-group')).toHaveValue('rating');
});

test('E2: a search with no results links to the search tips', async ({ page }) => {
  await page.goto('/search?q=tag%3Anowhere');
  await page.getByRole('link', { name: 'search tips' }).click();
  await expect(page).toHaveURL('/search/tips');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Search tips');
  await expect(page.locator('.tips-table').first()).toContainText('group:rating');
});
