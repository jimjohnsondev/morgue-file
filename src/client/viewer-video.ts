// The video player's controls (frame 7): play, scrub, step a frame at a time, loop a range,
// speed and sound. requestVideoFrameCallback says which frame is on show, so frame-step moves from
// the frame the painter sees, and the loop jumps back after its out frame, not a few frames late
// (R20). The comma and period keys step, and I and O (or [ and ]) set the loop's in and out points.
import { onPageKeys } from './keys.js';
import {
  FLOAT_SLACK,
  frameAtTime,
  frameHoldingTime,
  frameNumber,
  lastFrame,
  seekTimeOfFrame,
  startOfFrame,
  steppedFrame,
} from './video-frames.js';

/** The player's parts, and the frame on show, which every control reads. */
type Player = {
  readonly video: HTMLVideoElement;
  readonly scrub: HTMLInputElement;
  readonly loopBar: HTMLElement;
  readonly fps: number;
  shownFrame: number;
};

/** The loop range, as its first and last frames, and whether the player keeps to it. */
type Loop = { in: number | undefined; out: number | undefined; isOn: boolean };

/** How far past a frame's start a seek to that start goes: far under a hundredth of a second. */
const FRAME_START_HAIR = 1e-4;

/** 0:42.12, or 1:02:07.50 past an hour: minutes, seconds and hundredths. */
function formatTimecode(totalSeconds: number): string {
  // The slack keeps a frame's start, such as 7 ÷ 30 s, from reading a hundredth early.
  const totalHundredths = Math.floor(totalSeconds * 100 + FLOAT_SLACK);
  const hundredths = totalHundredths % 100;
  const seconds = Math.floor(totalHundredths / 100) % 60;
  const minutes = Math.floor(totalHundredths / 6000);
  const fraction = `${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
  return minutes < 60
    ? `${String(minutes)}:${fraction}`
    : `${String(Math.floor(minutes / 60))}:${String(minutes % 60).padStart(2, '0')}:${fraction}`;
}

/** Writes text into one of the player's readouts. */
function setText(name: string, text: string): void {
  const readout = document.querySelector(`[data-video-text="${name}"]`);
  if (readout !== null) {
    readout.textContent = text;
  }
}

/** Finds one of the player's buttons. */
function actionButton(name: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`[data-video-action="${name}"]`);
}

/** The video's length in seconds, or 0 before the browser knows it. */
function durationOf(video: HTMLVideoElement): number {
  return Number.isFinite(video.duration) ? video.duration : 0;
}

/**
 * Brings the time, frame number, scrub bar and play button up to date. The time is the one the
 * player was scrubbed or stepped to, and the frame number names the frame on show.
 */
function showPosition(player: Player): void {
  const { video, scrub, shownFrame } = player;
  const duration = durationOf(video);
  setText('time', `${formatTimecode(video.currentTime)} / ${formatTimecode(duration)}`);
  setText('frame', `frame ${frameNumber(shownFrame).toLocaleString('en-US')}`);
  scrub.max = String(duration);
  if (!video.seeking) {
    scrub.value = String(video.currentTime);
  }
  const play = actionButton('play');
  if (play !== null) {
    play.textContent = video.paused ? '▶ Play' : '❚❚ Pause';
  }
}

/** Writes a loop point's timecode: the start of its frame, or dashes before it is set. */
function showLoopPoint(name: string, frame: number | undefined, fps: number): void {
  setText(name, frame === undefined ? '–:––.––' : formatTimecode(startOfFrame(frame, fps)));
}

/** Draws the loop range on the scrub bar in magenta, and its in and out times. */
function showLoop(player: Player, loop: Loop): void {
  const { fps } = player;
  const duration = durationOf(player.video);
  showLoopPoint('loop-in', loop.in, fps);
  showLoopPoint('loop-out', loop.out, fps);
  const toggle = actionButton('loop');
  if (toggle !== null) {
    toggle.setAttribute('aria-pressed', String(loop.isOn));
    toggle.textContent = loop.isOn ? 'Loop on' : 'Loop off';
  }
  const { in: start, out: end } = loop;
  if (start === undefined || end === undefined || end <= start || duration === 0) {
    player.loopBar.hidden = true;
    return;
  }
  const startTime = startOfFrame(start, fps);
  const endTime = startOfFrame(end, fps);
  player.loopBar.hidden = false;
  player.loopBar.style.left = `${String((startTime / duration) * 100)}%`;
  player.loopBar.style.width = `${String(((endTime - startTime) / duration) * 100)}%`;
}

/** Steps to the middle of this frame, and counts it as on show straight away. */
function showFrame(player: Player, frame: number): void {
  player.shownFrame = frame;
  player.video.currentTime = seekTimeOfFrame(frame, player.fps);
  showPosition(player);
}

/** Seeks to a time from the scrub bar or the history, counting its frame as on show straight away. */
function showTime(player: Player, seconds: number): void {
  const frame = frameHoldingTime(seconds, player.fps);
  player.shownFrame = frame;
  // A time on a frame's exact start can land on the frame before it, so seek a hair past it.
  player.video.currentTime = Math.max(seconds, startOfFrame(frame, player.fps) + FRAME_START_HAIR);
  showPosition(player);
}

/** Pauses and moves one frame back or forward from the frame on show. */
function stepFrame(player: Player, frames: number): void {
  const { video, fps } = player;
  video.pause();
  showFrame(player, steppedFrame(player.shownFrame, frames, lastFrame(video.duration, fps)));
}

/** The loop's first frame when the loop is on and this frame lies outside it, else undefined. */
function loopRestart(loop: Loop, frame: number): number | undefined {
  const { in: start, out: end } = loop;
  if (!loop.isOn || start === undefined || end === undefined || end <= start) {
    return undefined;
  }
  // The out frame itself counts as outside: once it is on show, the next frame would overrun.
  return frame < start || frame >= end ? start : undefined;
}

/**
 * Follows every frame the browser shows: the readouts follow it, and while the loop plays, its
 * out frame sends the video back to the in frame. A seek in flight was counted by whatever started it.
 */
function followFrames(player: Player, loop: Loop): void {
  const { video, fps } = player;
  function onFrame(_now: number, metadata: VideoFrameCallbackMetadata): void {
    if (!video.seeking) {
      player.shownFrame = frameAtTime(metadata.mediaTime, fps);
      const restart = video.paused ? undefined : loopRestart(loop, player.shownFrame);
      if (restart !== undefined) {
        // Back to the in frame's start, not its middle, so it stays on show for its whole span:
        // from the middle, a slow PC's clock can pass the frame before it is drawn.
        showTime(player, startOfFrame(restart, fps));
      }
      showPosition(player);
    }
    video.requestVideoFrameCallback(onFrame);
  }
  video.requestVideoFrameCallback(onFrame);
}

/** Plays or pauses. Play from outside a loop that is on starts at the loop's in frame. */
function togglePlay(player: Player, loop: Loop): void {
  const { video } = player;
  if (!video.paused) {
    video.pause();
    return;
  }
  const restart = loopRestart(loop, player.shownFrame);
  if (restart === undefined) {
    void video.play();
    return;
  }
  // Playing only once the seek lands draws the in frame first, before the clock runs. A step or
  // scrub before then moves the frame on, and the video stays paused.
  showFrame(player, restart);
  video.addEventListener(
    'seeked',
    () => {
      if (player.shownFrame === restart) {
        void video.play();
      }
    },
    { once: true },
  );
}

/** The player's buttons by their data-video-action name. */
type ActionName = 'play' | 'back' | 'forward' | 'loop-in' | 'loop-out' | 'loop';

/** The player's actions by button name, which the keys share. */
function playerActions(player: Player, loop: Loop): Record<ActionName, () => void> {
  return {
    play: () => {
      togglePlay(player, loop);
    },
    back: () => {
      stepFrame(player, -1);
    },
    forward: () => {
      stepFrame(player, 1);
    },
    'loop-in': () => {
      loop.in = player.shownFrame;
      showLoop(player, loop);
    },
    'loop-out': () => {
      loop.out = player.shownFrame;
      showLoop(player, loop);
    },
    loop: () => {
      loop.isOn = !loop.isOn;
      showLoop(player, loop);
    },
  };
}

/** Wires the selects for speed and sound. */
function enableSettings(video: HTMLVideoElement): void {
  const speed = document.querySelector<HTMLSelectElement>('[data-video-setting="speed"]');
  speed?.addEventListener('change', () => {
    video.playbackRate = Number(speed.value);
  });
  const sound = document.querySelector<HTMLSelectElement>('[data-video-setting="sound"]');
  sound?.addEventListener('change', () => {
    video.muted = sound.value === 'muted';
  });
}

/**
 * Starts the video at the time Home's history reopened it at (R35), once the browser knows its
 * length; a page with no start time plays from 0:00.
 */
function startAtHistoryTime(player: Player): void {
  const { video } = player;
  const start = Number(video.dataset.start);
  if (video.dataset.start === undefined || !Number.isFinite(start)) {
    return;
  }
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    showTime(player, start);
    return;
  }
  video.addEventListener(
    'loadedmetadata',
    () => {
      showTime(player, start);
    },
    { once: true },
  );
}

/** Wires every control of one player. */
function enablePlayer(player: Player): void {
  const { video, scrub } = player;
  const loop: Loop = { in: undefined, out: undefined, isOn: false };
  const actions = playerActions(player, loop);
  for (const [name, action] of Object.entries(actions)) {
    actionButton(name)?.addEventListener('click', action);
  }
  for (const event of ['loadedmetadata', 'play', 'pause', 'seeked']) {
    video.addEventListener(event, () => {
      showPosition(player);
    });
  }
  followFrames(player, loop);
  scrub.addEventListener('input', () => {
    showTime(player, Number(scrub.value));
  });
  enableSettings(video);
  startAtHistoryTime(player);
  onPageKeys({
    ',': actions.back,
    '.': actions.forward,
    i: actions['loop-in'],
    '[': actions['loop-in'],
    o: actions['loop-out'],
    ']': actions['loop-out'],
  });
}

const video = document.querySelector<HTMLVideoElement>('[data-video-player]');
const scrub = document.querySelector<HTMLInputElement>('[data-video-scrub]');
const loopBar = document.querySelector<HTMLElement>('[data-video-loop]');
if (video !== null && scrub !== null && loopBar !== null) {
  enablePlayer({ video, scrub, loopBar, fps: Number(video.dataset.fps ?? '30'), shownFrame: 0 });
}
