// Encodes test-pattern clips with the ffmpeg binary from ffmpeg-static. The bitexact flags and a
// single encoder thread make the same bytes on every run. ffmpeg's testsrc pattern shows a frame
// counter and compresses well, so even frame 7's 3:15 at 1080p stays a few MB.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import ffmpegModule from 'ffmpeg-static';

import type { Random } from './random.ts';

const runFile = promisify(execFile);

/**
 * The ffmpeg binary's path. ffmpeg-static is CommonJS, so its default import is the path itself,
 * though its type declarations describe a module object; narrowing makes both agree.
 */
function ffmpegPath(): string {
  const exported: unknown = ffmpegModule;
  if (typeof exported !== 'string') {
    throw new Error('ffmpeg-static has no ffmpeg binary for this platform.');
  }
  return exported;
}

/** One clip to encode: size, frame rate, length, and where to write it. */
export type Clip = {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationSeconds: number;
  readonly outputPath: string;
};

/** Writes a clip of ffmpeg's test pattern, its hue shifted so clips look different. */
export async function encodeClip(clip: Clip, random: Random): Promise<void> {
  const source = `testsrc=size=${String(clip.width)}x${String(clip.height)}:rate=${String(clip.fps)}`;
  const hue = Math.round(random() * 360);
  await runFile(ffmpegPath(), [
    ...['-hide_banner', '-loglevel', 'error', '-y'],
    ...['-f', 'lavfi', '-i', `${source}:duration=${String(clip.durationSeconds)}`],
    ...['-vf', `hue=h=${String(hue)}`, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '35'],
    ...['-pix_fmt', 'yuv420p', '-threads', '1', '-map_metadata', '-1'],
    ...['-fflags', '+bitexact', '-flags:v', '+bitexact', clip.outputPath],
  ]);
}
