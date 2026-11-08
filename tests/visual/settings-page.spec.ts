// Frame 15, Settings, captured from the shared server on the fixture archive. Its baseline is
// approved in the PR that builds it (docs/DESIGN-BRIEF.md, How the design gate works, step 5).
import { freezeClock, openWhenSettled, SCREENSHOT_OPTIONS } from '../support/screenshots.js';
import { expect, test } from '../support/shared-server-test.js';

/** The shared server may still be making thumbnails when this runs first. */
test.describe.configure({ timeout: 660_000 });

test('frame 15: Settings', async ({ page }) => {
  await freezeClock(page);
  await openWhenSettled(page, '/settings');
  await expect(page).toHaveScreenshot('frame-15-settings.png', SCREENSHOT_OPTIONS);
});
