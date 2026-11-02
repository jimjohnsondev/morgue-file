// Prepares the set-up install the Playwright server runs from, so pages render instead of
// redirecting to /setup. Run with plain node before the server starts (see playwright.config.ts).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const homeDir = process.env.MORGUE_HOME;
if (homeDir === undefined || homeDir === '') {
  throw new Error('Set MORGUE_HOME to the folder to prepare.');
}

const dataDir = path.join(homeDir, 'data');
// Beside the home folder, never inside it: setup refuses folders nested in each other.
const referenceDir = `${homeDir}-reference`;

rmSync(homeDir, { recursive: true, force: true });
rmSync(referenceDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });
mkdirSync(path.join(referenceDir, 'Inbox'), { recursive: true });
writeFileSync(path.join(homeDir, 'morgue-file.json'), JSON.stringify({ dataDir: 'data' }));
writeFileSync(
  path.join(dataDir, 'settings.json'),
  JSON.stringify({ referenceDirAbsolute: referenceDir }),
);
