// The Item page's viewer slot for photos and videos (frames 5 and 7): the image with its zoom
// controls, and the player with its scrub bar, frame-step, loop range, speed and sound. The
// controls work through src/client/viewer-image.ts and viewer-video.ts.
import { formatDuration } from '../format.js';

import type { ComponentChildren } from 'preact';

/** The title bar every viewer shares: what it shows, and the viewing mode hint. */
export type ViewerFrame = {
  /** "Viewer · seated_backlit_017.jpg" */
  readonly title: string;
  readonly viewingHref: string;
};

/** A photo, shown from its original. */
export type ImageViewerModel = ViewerFrame & {
  readonly kind: 'image';
  readonly src: string;
  readonly alt: string;
  readonly width: number | undefined;
  readonly height: number | undefined;
};

/** A video, played from its original. */
export type VideoPlayerModel = ViewerFrame & {
  readonly kind: 'video';
  readonly src: string;
  readonly durationMs: number | undefined;
  /** Frames per second from ffprobe, the step of the frame buttons; 30 if not known yet. */
  readonly fps: number;
};

/** The viewer panel: title bar with the viewing mode hint, then the viewer's own parts. */
export function ViewerPanel(props: {
  readonly frame: ViewerFrame;
  readonly label: string;
  readonly children: ComponentChildren;
}) {
  return (
    <section aria-label={props.label} class="panel viewer-panel">
      <h2 class="panel__title panel__title--split">
        <span>{props.frame.title}</span>
        <span class="panel__title-note">
          press <b>V</b> for{' '}
          <a href={props.frame.viewingHref} data-viewing-toggle>
            viewing mode
          </a>
        </span>
      </h2>
      {props.children}
    </section>
  );
}

/** One zoom choice: Fit, 100%, 200%. The client marks the current one. */
function ZoomChoice(props: { readonly level: string; readonly label: string }) {
  return (
    <button
      type="button"
      class="link-button zoom-choice"
      data-zoom-level={props.level}
      aria-pressed={props.level === 'fit' ? 'true' : 'false'}
    >
      {props.label}
    </button>
  );
}

/** The image viewer: zoom in and out, fit or actual size, drag to pan (R19). */
export function ImageViewer(props: { readonly model: ImageViewerModel }) {
  const { model } = props;
  return (
    <ViewerPanel frame={model} label="Image viewer">
      <div class="viewer-toolbar">
        <span class="viewer-toolbar__group">
          <button type="button" class="button" data-zoom-step="out" aria-label="Zoom out">
            −
          </button>
          <button type="button" class="button" data-zoom-step="in" aria-label="Zoom in">
            +
          </button>
          <ZoomChoice level="fit" label="Fit" /> · <ZoomChoice level="1" label="100%" /> ·{' '}
          <ZoomChoice level="2" label="200%" />
          <span class="caption">drag to pan</span>
        </span>
        <span>
          <a href={model.src}>open original</a>
        </span>
      </div>
      <div class="viewer-stage" data-image-stage>
        <img
          class="viewer-stage__image"
          src={model.src}
          alt={model.alt}
          width={model.width}
          height={model.height}
          draggable={false}
          data-image-viewer
        />
      </div>
    </ViewerPanel>
  );
}

/** A labelled timecode box in the query font, cyan on black like the footer counters. */
function Timecode(props: { readonly name: string; readonly text: string }) {
  return (
    <span class="timecode" data-video-text={props.name}>
      {props.text}
    </span>
  );
}

/** The player's buttons: play, frame-step, the loop range, speed and sound. */
function VideoControls(props: { readonly durationText: string }) {
  return (
    <div class="video-controls__row">
      <span class="video-controls__group">
        <button type="button" class="button" data-video-action="play">
          ▶ Play
        </button>
        <button type="button" class="button" data-video-action="back">
          ‹ Frame
        </button>
        <button type="button" class="button" data-video-action="forward">
          Frame ›
        </button>
        <Timecode name="time" text={`0:00.00 / ${props.durationText}`} />
        <span class="caption" data-video-text="frame">
          frame 0
        </span>
      </span>
      <span class="video-controls__group">
        <b>Loop:</b>
        <button type="button" class="button" data-video-action="loop-in">
          Set in (I)
        </button>
        <Timecode name="loop-in" text="–:––.––" />
        <button type="button" class="button" data-video-action="loop-out">
          Set out (O)
        </button>
        <Timecode name="loop-out" text="–:––.––" />
        <button type="button" class="button" data-video-action="loop" aria-pressed="false">
          Loop off
        </button>
      </span>
      <span class="video-controls__group">
        <label for="video-speed">Speed</label>
        <select id="video-speed" class="field" data-video-setting="speed">
          <option value="0.25">0.25×</option>
          <option value="0.5">0.5×</option>
          <option value="1" selected>
            1×
          </option>
          <option value="2">2×</option>
        </select>
        <label for="video-sound">Sound</label>
        <select id="video-sound" class="field" data-video-setting="sound">
          <option value="muted" selected>
            Muted
          </option>
          <option value="on">On</option>
        </select>
      </span>
    </div>
  );
}

/** The video player: the video on the viewer gray, a scrub bar showing the loop range, controls. */
export function VideoPlayer(props: { readonly model: VideoPlayerModel }) {
  const { model } = props;
  const seconds = (model.durationMs ?? 0) / 1000;
  return (
    <ViewerPanel frame={model} label="Video player">
      <div class="viewer-stage viewer-stage--video">
        <video
          class="viewer-stage__video"
          src={model.src}
          preload="metadata"
          muted
          data-video-player
          data-fps={String(model.fps)}
        />
      </div>
      <div class="video-controls">
        <div class="scrub">
          <div class="scrub__loop" data-video-loop hidden />
          <input
            type="range"
            class="scrub__input"
            min="0"
            max={String(seconds)}
            step="any"
            value="0"
            aria-label="Position"
            data-video-scrub
          />
        </div>
        <VideoControls durationText={`${formatDuration(model.durationMs ?? 0)}.00`} />
      </div>
    </ViewerPanel>
  );
}
