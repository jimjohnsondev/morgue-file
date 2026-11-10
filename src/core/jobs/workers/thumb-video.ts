// Video thumbnails: ffprobe reads the duration, frame rate and size; ffmpeg grabs the frame 10%
// of the way in, past any fade from black; sharp crops it.
import { AppError } from '#core/errors.js';

import { cropToThumbnail } from './crop.js';
import { runTool } from './run-tool.js';

import type { MediaDetails } from '#core/db/repositories/item-files.js';
import type { ThumbnailSize } from '../thumbnail-files.js';
import type { ThumbnailResult } from './crop.js';
import type { MediaTools } from './media-tools.js';

/** How far into the video the poster frame is taken. */
const POSTER_POSITION = 0.1;

/** The parts of ffprobe's JSON this reads. */
type ProbeOutput = {
  readonly streams?: readonly {
    readonly width?: number;
    readonly height?: number;
    readonly avg_frame_rate?: string;
    readonly r_frame_rate?: string;
  }[];
  readonly format?: { readonly duration?: string };
};

/** Reads a rate such as 30000/1001; undefined for 0/0, which ffprobe gives when it can't tell. */
function parseFrameRate(rate: string | undefined): number | undefined {
  const [numerator, denominator] = (rate ?? '').split('/').map(Number);
  if (numerator === undefined || denominator === undefined || !(numerator > 0 && denominator > 0)) {
    return undefined;
  }
  return Math.round((numerator / denominator) * 1000) / 1000;
}

/** Reads a video's duration, frame rate and size with ffprobe. */
export async function probeVideo(tools: MediaTools, file: string): Promise<MediaDetails> {
  const args = ['-v', 'error', '-select_streams', 'v:0', '-show_entries'];
  args.push('stream=width,height,avg_frame_rate,r_frame_rate:format=duration', '-of', 'json');
  const output = JSON.parse(
    (await runTool(tools.ffprobe, [...args, file])).toString(),
  ) as ProbeOutput;
  const stream = output.streams?.[0];
  if (stream === undefined) {
    throw new AppError('media-unreadable', 'The file has no video stream.');
  }
  const seconds = Number(output.format?.duration);
  return {
    width: stream.width,
    height: stream.height,
    fps: parseFrameRate(stream.avg_frame_rate) ?? parseFrameRate(stream.r_frame_rate),
    durationMs: Number.isFinite(seconds) ? Math.round(seconds * 1000) : undefined,
  };
}

/** Grabs one frame as a PNG. Seeking before the input makes ffmpeg jump instead of decoding. */
async function grabFrame(tools: MediaTools, file: string, atMs: number): Promise<Buffer> {
  const seconds = (atMs / 1000).toFixed(3);
  const args = ['-v', 'error', '-ss', seconds, '-i', file, '-frames:v', '1'];
  return runTool(tools.ffmpeg, [...args, '-f', 'image2pipe', '-c:v', 'png', '-']);
}

/** Makes a video's thumbnail from its poster frame and reads its media details. */
export async function makeVideoThumbnail(
  tools: MediaTools,
  file: string,
  size: ThumbnailSize,
): Promise<ThumbnailResult> {
  const details = await probeVideo(tools, file);
  const frame = await grabFrame(tools, file, (details.durationMs ?? 0) * POSTER_POSITION);
  return { webp: await cropToThumbnail(frame, size), details };
}
