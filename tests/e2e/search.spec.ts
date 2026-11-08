// R24 in a browser on the fixture archive: the banner's search box finds items by the words of
// their file names, and lists the models its words find above the items.
import { expect, test } from '../support/shared-server-test.js';

test('R24: the search box finds items by file name words and lists the models it finds', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#banner-q').fill('seated_backlit');
  await page.locator('#banner-q').press('Enter');
  await expect(page).toHaveURL('/search?q=seated_backlit');
  await expect(page.locator('.thumb-grid')).toContainText('seated_backlit_017.jpg');

  await page.locator('#banner-q').fill('dancer');
  await page.locator('#banner-q').press('Enter');
  await expect(page).toHaveURL('/search?q=dancer');
  await page.locator('.matched-models').getByRole('link', { name: 'Elena Varga' }).click();
  await expect(page).toHaveURL('/models/elena-varga');
});
