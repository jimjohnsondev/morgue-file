// Entry point for Morgue File.cmd and its shortcuts. Problems are printed in the console window,
// which Morgue File.cmd keeps open when the launcher fails.
import { findAppDir, findHomeDir, LOOPBACK_HOST, readVersion } from './config.js';
import { launch } from './launch.js';
import { openBrowser } from './open-browser.js';

/** Opens the browser, unless MORGUE_NO_BROWSER is set by the package test. */
function openUnlessHeadless(url: string): void {
  if (process.env.MORGUE_NO_BROWSER === '1') {
    console.warn(`Morgue File is at ${url}`);
    return;
  }
  openBrowser(url);
}

const appDir = findAppDir();
try {
  await launch({
    config: {
      host: LOOPBACK_HOST,
      appDir,
      homeDir: findHomeDir(appDir),
      version: readVersion(appDir),
    },
    openUrl: openUnlessHeadless,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
