// Frame 14, Edit model profile, captured from the shared server on the fixture archive, saving
// nothing. Its baseline is approved in the PR that builds it (docs/DESIGN-BRIEF.md, How the
// design gate works, step 5).
import { freezeClock, openWhenSettled, SCREENSHOT_OPTIONS } from '../support/screenshots.js';
import { expect, test } from '../support/shared-server-test.js';

/** The shared server may still be making thumbnails when this runs first. */
test.describe.configure({ timeout: 660_000 });

test('frame 14: Edit model profile', async ({ page }) => {
  await freezeClock(page);
  await openWhenSettled(page, '/models/elena-varga/edit');
  await expect(page).toHaveScreenshot('frame-14-edit-model-profile.png', SCREENSHOT_OPTIONS);
});
