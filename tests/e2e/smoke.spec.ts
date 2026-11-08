// Smoke test: the built server starts, answers its health check and renders Home in Chromium.
import { expect, test } from '../support/shared-server-test.js';

test('the health check names the app', async ({ request }) => {
  const response = await request.get('/healthz');
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ app: 'morgue-file' });
});

test('Home renders with the banner, tab bar and the built stylesheet', async ({ page }) => {
  const failedRequests: string[] = [];
  page.on('requestfailed', (request) => failedRequests.push(request.url()));

  await page.goto('/');

  await expect(page).toHaveTitle('Home · Morgue File');
  await expect(page.locator('.banner__wordmark')).toContainText('MORGUE');
  await expect(page.locator('.tab--current')).toHaveText('Home');
  await expect(page.locator('.tab--end')).toHaveText('Settings');
  // The page background comes from tokens.css, so this proves the CSS bundle loaded.
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe('rgb(198, 202, 209)');
  expect(failedRequests).toEqual([]);
});
