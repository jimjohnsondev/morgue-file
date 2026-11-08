// Frame 13, Select and tag, captured from the shared server on the fixture archive: 31 selected
// on page 3 of Figure, as the design brief's Sample content says, with "fore" typed into the tag
// field so its suggestions show. Its baseline is approved in the PR that builds it
// (docs/DESIGN-BRIEF.md, How the design gate works, step 5). Nothing is saved, so the shared
// server's library stays as the other frames need it.
import { freezeClock, openWhenSettled, SCREENSHOT_OPTIONS } from '../support/screenshots.js';
import { expect, test } from '../support/shared-server-test.js';

/** The shared server may still be making thumbnails when this runs first. */
test.describe.configure({ timeout: 660_000 });

test('frame 13: Photos › Figure, selecting to tag', async ({ page }) => {
  await freezeClock(page);
  await openWhenSettled(page, '/photos/figure?page=3&select=on');
  const thumbs = page.locator('[data-select-card] .thumb');
  // The mock's 31: the first 24 cards as one run, then every other card from the 31st to the 43rd.
  await thumbs.nth(0).click();
  await thumbs.nth(23).click({ modifiers: ['Shift'] });
  for (let index = 30; index <= 42; index += 2) {
    await thumbs.nth(index).click();
  }
  const panel = page.getByRole('region', { name: 'Edit selected items' });
  await expect(panel.getByRole('heading')).toHaveText('31 selected on this pagedone selecting');
  await panel.getByLabel('Tag', { exact: true }).fill('fore');
  await expect(page.getByRole('option', { name: 'foreshortened tag' })).toBeVisible();
  // The pointer leaves the grid so no hover outline shows; the field keeps the focus, which
  // keeps its suggestions open.
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('frame-13-select-and-tag.png', SCREENSHOT_OPTIONS);
});
