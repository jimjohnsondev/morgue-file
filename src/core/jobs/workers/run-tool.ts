// Runs ffmpeg or ffprobe and collects what it prints. The one wrapper around execFile in core.
import { execFile } from 'node:child_process';

/** Longest a tool may run; a frame grab or probe takes well under a second. */
const TOOL_TIMEOUT_MS = 60_000;

/** Enough for a full-size PNG frame from a 4K video. */
const MAX_OUTPUT_BYTES = 128 * 1024 * 1024;

/**
 * Runs a program with arguments (no shell, so nothing in a file name is ever interpreted) and
 * resolves with its standard output. A failure carries the tool's own error text.
 */
export async function runTool(program: string, args: readonly string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      program,
      args,
      {
        encoding: 'buffer',
        timeout: TOOL_TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve(stdout);
        } else {
          const detail = stderr.toString().trim();
          reject(new Error(detail === '' ? error.message : detail));
        }
      },
    );
  });
}
