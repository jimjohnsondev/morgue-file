// Frame arithmetic for the video player (R20). Frames are counted from 0, and frame n covers the
// times from n ÷ fps up to the next frame, so the player seeks to the middle of a frame: a seek to
// its exact start can land on the frame before it when the division rounds down.

/** The frame on show at a media time, as requestVideoFrameCallback reports it. */
export function frameAtTime(mediaTime: number, fps: number): number {
  // The browser rounds media times to microseconds (frame 1 at 30 fps is 0.033333), so round to
  // the nearest frame rather than flooring.
  return Math.max(0, Math.round(mediaTime * fps));
}

/** The frame a scrub bar or history time lands on: the one whose span holds that time. */
export function frameHoldingTime(seconds: number, fps: number): number {
  // A little slack keeps a time such as 42 s at 30 fps on frame 1,260 despite float error.
  return Math.max(0, Math.floor(seconds * fps + 1e-6));
}

/** The time a frame starts at, for the timecode readouts. */
export function startOfFrame(frame: number, fps: number): number {
  return frame / fps;
}

/** The time to seek to so the browser shows exactly this frame. */
export function seekTimeOfFrame(frame: number, fps: number): number {
  return (frame + 0.5) / fps;
}

/** The last frame of a video of this length, or 0 before the length is known. */
export function lastFrame(duration: number, fps: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  return Math.max(0, Math.ceil(duration * fps - 1e-6) - 1);
}

/** A frame moved by some frames, kept inside the video. */
export function steppedFrame(frame: number, step: number, last: number): number {
  return Math.min(last, Math.max(0, frame + step));
}
