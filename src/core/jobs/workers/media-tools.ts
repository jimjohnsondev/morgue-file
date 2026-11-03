// Finds ffmpeg and ffprobe: in bin\ beside the app in the Windows zip, or from the npm packages
// that provide them in a development checkout (docs/ARCHITECTURE.md, Packaging step 3).
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/** Where the video tools are. */
export type MediaTools = {
  readonly ffmpeg: string;
  readonly ffprobe: string;
};

/** The tool's file name on this system. */
function executableName(tool: string): string {
  return process.platform === 'win32' ? `${tool}.exe` : tool;
}

/** The tools the package copies into bin\, one folder up from app\. */
function findPackagedTools(appDir: string): MediaTools | undefined {
  const binDir = path.join(appDir, '..', 'bin');
  const tools = {
    ffmpeg: path.join(binDir, executableName('ffmpeg')),
    ffprobe: path.join(binDir, executableName('ffprobe')),
  };
  return existsSync(tools.ffmpeg) && existsSync(tools.ffprobe) ? tools : undefined;
}

/**
 * The tools from the development dependencies. They aren't installed in the zip, which has its
 * own copies in bin\, so they're loaded only when those are missing.
 */
function findDevelopmentTools(): MediaTools | undefined {
  // Both packages are CommonJS modules whose export is the path, which import() can't type.
  const loadPackage = createRequire(import.meta.url);
  try {
    const ffmpeg = loadPackage('ffmpeg-static') as string | null;
    const ffprobe = (loadPackage('@ffprobe-installer/ffprobe') as { path: string }).path;
    return ffmpeg === null ? undefined : { ffmpeg, ffprobe };
  } catch {
    // Not installed: this is a packaged app whose bin\ is incomplete. Video jobs report it.
    return undefined;
  }
}

/** Returns where ffmpeg and ffprobe are, or undefined if neither place has them. */
export function findMediaTools(appDir: string): MediaTools | undefined {
  return findPackagedTools(appDir) ?? findDevelopmentTools();
}
