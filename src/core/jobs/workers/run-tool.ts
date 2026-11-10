// Runs ffmpeg or ffprobe and collects what it prints. The one wrapper around execFile in core.
import { execFile } from 'node:child_process';

import { AppError } from '#core/errors.js';

/** Longest a tool may run; a frame grab or probe takes well under a second. */
const TOOL_TIMEOUT_MS = 60_000;

/** Enough for a full-size PNG frame from a 4K video. */
const MAX_OUTPUT_BYTES = 128 * 1024 * 1024;

/** What a tool reads on its standard input, and how much output to allow if more than usual. */
export type ToolOptions = {
  readonly input?: Buffer;
  readonly maxOutputBytes?: number;
};

/**
 * Runs a program with arguments (no shell, so nothing in a file name is ever interpreted) and
 * resolves with its standard output. A failure carries the tool's own error text.
 */
export async function runTool(
  program: string,
  args: readonly string[],
  options: ToolOptions = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      program,
      args,
      {
        encoding: 'buffer',
        timeout: TOOL_TIMEOUT_MS,
        maxBuffer: Math.max(MAX_OUTPUT_BYTES, options.maxOutputBytes ?? 0),
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve(stdout);
        } else {
          const detail = stderr.toString().trim();
          reject(new AppError('media-unreadable', detail === '' ? error.message : detail));
        }
      },
    );
    // A tool that fails early closes its input; the error above reports why, not the broken pipe.
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(options.input);
  });
}
