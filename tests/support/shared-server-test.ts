// Playwright's test and expect for every spec on the shared e2e server except the history one:
// the e2e and visual specs, and the R21 perf spec.
// On the shared e2e server, every item a spec opens would otherwise add to the viewing history
// (R35), and Home's first strip, frame 12 and the Home specs draw the history seed.json gives
// that server. So in these specs the page answers its own history writes without sending them;
// tests/e2e/viewing-history.spec.ts records them on a server of its own. The writes are stopped
// in the page rather than with a route, since Playwright doesn't see the one a page sends as it
// is left (a keepalive fetch).
import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';

/** Wraps the page's fetch so viewing-history writes are answered as saved but never sent. */
function keepHistoryWritesInPage(): void {
  const send = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    return /\/api\/items\/\d+\/view$/.test(url)
      ? Promise.resolve(new Response(null, { status: 204 }))
      : send(input, init);
  };
}

/** test, with every viewing-history write kept in the page. */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(keepHistoryWritesInPage);
    await use(context);
  },
});
