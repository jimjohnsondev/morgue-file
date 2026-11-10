import { describe, expect, it } from 'vitest';

import {
  frameAtTime,
  frameHoldingTime,
  frameNumber,
  lastFrame,
  seekTimeOfFrame,
  steppedFrame,
} from '../../src/client/video-frames.js';

describe('R20: frame arithmetic for frame-step and the loop range', () => {
  it('names the frame on show from the media time the browser reports, in microseconds', () => {
    expect(frameAtTime(0, 30)).toBe(0);
    expect(frameAtTime(0.033333, 30)).toBe(1);
    expect(frameAtTime(42.033333, 30)).toBe(1261);
    expect(frameAtTime(1.001, 29.97)).toBe(30);
  });

  it('seeks to the middle of a frame, which the browser shows as that frame', () => {
    for (const frame of [0, 1, 29, 1260, 5849]) {
      const time = seekTimeOfFrame(frame, 30);
      expect(frameHoldingTime(time, 30)).toBe(frame);
      expect(frameAtTime(Math.round((frame / 30) * 1e6) / 1e6, 30)).toBe(frame);
    }
  });

  it('puts a scrubbed time on the frame whose span holds it', () => {
    expect(frameHoldingTime(42, 30)).toBe(1260);
    expect(frameHoldingTime(60, 30)).toBe(1800);
    expect(frameHoldingTime(0.0499, 30)).toBe(1);
  });

  it("numbers frames from 1, as the design brief's frame 7 does", () => {
    expect(frameNumber(frameHoldingTime(42.12, 30))).toBe(1264);
    expect(frameNumber(frameHoldingTime(58.5, 30))).toBe(1756);
    expect(frameNumber(frameHoldingTime(93.6, 30))).toBe(2809);
  });

  it('steps inside the video, from the first frame to the last', () => {
    expect(lastFrame(2, 30)).toBe(59);
    expect(lastFrame(195, 30)).toBe(5849);
    expect(lastFrame(Number.NaN, 30)).toBe(0);
    expect(steppedFrame(0, -1, 59)).toBe(0);
    expect(steppedFrame(58, 1, 59)).toBe(59);
    expect(steppedFrame(59, 1, 59)).toBe(59);
    expect(steppedFrame(10, -1, 59)).toBe(9);
  });
});
