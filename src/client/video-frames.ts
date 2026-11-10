// Frame arithmetic for the video player (R20). Frames are indexed from 0 here, and frame n covers
// the times from n ÷ fps up to the next frame, so the player steps to the middle of a frame: a seek
// to its exact start can land on the frame before it when the division rounds down. The readout
// counts frames from 1, as the design brief does: 42.12 s at 30 fps is frame 1,264.

/**
 * Slack for float error in times × frame rates: 42 s × 30 is 1,260 exactly, but a time such as
 * 93.6 s × 30 comes out a hair under 2,808 and would otherwise floor to the frame before.
 */
export const FLOAT_SLACK = 1e-6;

/** The frame on show at a media time, as requestVideoFrameCallback reports it. */
export function frameAtTime(mediaTime: number, fps: number): number {
  // The browser rounds media times to microseconds (frame 1 at 30 fps is 0.033333), so round to
  // the nearest frame rather than flooring.
  return Math.max(0, Math.round(mediaTime * fps));
}

/** The frame a scrub bar or history time lands on: the one whose span holds that time. */
export function frameHoldingTime(seconds: number, fps: number): number {
  return Math.max(0, Math.floor(seconds * fps + FLOAT_SLACK));
}

/** The time a frame starts at, for the loop's in and out readouts. */
export function startOfFrame(frame: number, fps: number): number {
  return frame / fps;
}

/** The time a frame-step seeks to so the browser shows exactly this frame. */
export function seekTimeOfFrame(frame: number, fps: number): number {
  return (frame + 0.5) / fps;
}

/** The last frame of a video of this length, or 0 before the length is known. */
export function lastFrame(duration: number, fps: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  return Math.max(0, Math.ceil(duration * fps - FLOAT_SLACK) - 1);
}

/** A frame moved by some frames, kept inside the video. */
export function steppedFrame(frame: number, step: number, last: number): number {
  return Math.min(last, Math.max(0, frame + step));
}

/** The frame's number in the readout, counted from 1. */
export function frameNumber(frame: number): number {
  return frame + 1;
}
