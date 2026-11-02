// Starts the server without opening a browser, for npm run dev and the Playwright tests.
// The shortcut uses launcher.ts instead, which also reuses a running copy.
import {
  candidatePorts,
  DEFAULT_PORT,
  findAppDir,
  findHomeDir,
  LOOPBACK_HOST,
  readPortOverride,
  readVersion,
} from './config.js';
import { loadInstallState } from './install/install-state.js';
import { runServer } from './run.js';

const appDir = findAppDir();
const homeDir = findHomeDir(appDir);
const portOverride = readPortOverride();

await runServer({
  config: { host: LOOPBACK_HOST, appDir, homeDir, version: readVersion(appDir) },
  install: { current: await loadInstallState(homeDir) },
  ports: portOverride === undefined ? candidatePorts(DEFAULT_PORT) : [portOverride],
});
