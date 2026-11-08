// The video player's controls (frame 7): play, scrub, step a frame at a time, loop a range,
// speed and sound. Frame-step moves by 1 ÷ the frame rate ffprobe measured; the comma and period
// keys step, and I and O (or [ and ]) set the loop's in and out points.
import { onPageKeys } from './keys.js';

/** The player's parts. */
type Player = {
  readonly video: HTMLVideoElement;
  readonly scrub: HTMLInputElement;
  readonly loopBar: HTMLElement;
  readonly fps: number;
};

/** The loop range, in seconds, and whether the player keeps to it. */
type Loop = { in: number | undefined; out: number | undefined; isOn: boolean };

/** 0:42.12, or 1:02:07.50 past an hour: minutes, seconds and hundredths. */
function formatTimecode(totalSeconds: number): string {
  const hundredths = Math.floor(totalSeconds * 100) % 100;
  const seconds = Math.floor(totalSeconds) % 60;
  const minutes = Math.floor(totalSeconds / 60);
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

/** Brings the time, frame number, scrub bar and play button up to date. */
function showPosition(player: Player): void {
  const { video, scrub, fps } = player;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  setText('time', `${formatTimecode(video.currentTime)} / ${formatTimecode(duration)}`);
  setText('frame', `frame ${Math.round(video.currentTime * fps).toLocaleString('en-US')}`);
  scrub.max = String(duration);
  scrub.value = String(video.currentTime);
  const play = actionButton('play');
  if (play !== null) {
    play.textContent = video.paused ? '▶ Play' : '❚❚ Pause';
  }
}

/** Draws the loop range on the scrub bar in magenta, and its in and out times. */
function showLoop(player: Player, loop: Loop): void {
  const duration = player.video.duration;
  setText('loop-in', loop.in === undefined ? '–:––.––' : formatTimecode(loop.in));
  setText('loop-out', loop.out === undefined ? '–:––.––' : formatTimecode(loop.out));
  const toggle = actionButton('loop');
  if (toggle !== null) {
    toggle.setAttribute('aria-pressed', String(loop.isOn));
    toggle.textContent = loop.isOn ? 'Loop on' : 'Loop off';
  }
  const { in: start, out: end } = loop;
  const canDraw = Number.isFinite(duration) && duration > 0;
  if (start === undefined || end === undefined || end <= start || !canDraw) {
    player.loopBar.hidden = true;
    return;
  }
  player.loopBar.hidden = false;
  player.loopBar.style.left = `${String((start / duration) * 100)}%`;
  player.loopBar.style.width = `${String(((end - start) / duration) * 100)}%`;
}

/** Pauses and moves one frame back or forward. */
function stepFrame(player: Player, frames: number): void {
  const { video, fps } = player;
  video.pause();
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  video.currentTime = Math.min(duration, Math.max(0, video.currentTime + frames / fps));
}

/** Keeps playback inside the loop range while the loop is on. */
function keepInLoop(player: Player, loop: Loop): void {
  const { video } = player;
  if (loop.isOn && loop.in !== undefined && loop.out !== undefined && loop.out > loop.in) {
    if (video.currentTime >= loop.out || video.currentTime < loop.in) {
      video.currentTime = loop.in;
    }
  }
}

/** The player's buttons by their data-video-action name. */
type ActionName = 'play' | 'back' | 'forward' | 'loop-in' | 'loop-out' | 'loop';

/** The player's actions by button name, which the keys share. */
function playerActions(player: Player, loop: Loop): Record<ActionName, () => void> {
  const { video } = player;
  return {
    play: () => {
      if (video.paused) {
        void video.play();
      } else {
        video.pause();
      }
    },
    back: () => {
      stepFrame(player, -1);
    },
    forward: () => {
      stepFrame(player, 1);
    },
    'loop-in': () => {
      loop.in = video.currentTime;
      showLoop(player, loop);
    },
    'loop-out': () => {
      loop.out = video.currentTime;
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
function startAtHistoryTime(video: HTMLVideoElement): void {
  const start = Number(video.dataset.start);
  if (video.dataset.start === undefined || !Number.isFinite(start)) {
    return;
  }
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    video.currentTime = start;
    return;
  }
  video.addEventListener(
    'loadedmetadata',
    () => {
      video.currentTime = start;
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
  for (const event of ['loadedmetadata', 'timeupdate', 'play', 'pause', 'seeked']) {
    video.addEventListener(event, () => {
      keepInLoop(player, loop);
      showPosition(player);
    });
  }
  scrub.addEventListener('input', () => {
    video.currentTime = Number(scrub.value);
  });
  enableSettings(video);
  startAtHistoryTime(video);
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
  enablePlayer({ video, scrub, loopBar, fps: Number(video.dataset.fps ?? '30') });
}
