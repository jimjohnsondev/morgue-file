// Opens a URL in the default browser, the way double-clicking a link in Windows would.
import { spawn } from 'node:child_process';

/** The command that opens a URL on this platform. Windows is the target; the others serve dev. */
function browserCommand(url: string): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    // rundll32 takes the URL as one argument, so no shell ever parses it.
    return { command: 'rundll32', args: ['url.dll,FileProtocolHandler', url] };
  }
  if (process.platform === 'darwin') {
    return { command: 'open', args: [url] };
  }
  return { command: 'xdg-open', args: [url] };
}

/** Opens the URL in a new browser tab without waiting for the browser. */
export function openBrowser(url: string): void {
  const { command, args } = browserCommand(url);
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', (error) => {
    console.error(`Couldn't open the browser. Go to ${url} yourself. (${error.message})`);
  });
  child.unref();
}
