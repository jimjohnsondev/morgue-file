// The image viewer's zoom and pan (R19, frame 5): Fit, 100% and 200%, − and + in steps, the
// + − 0 keys, and dragging the picture to move around it when it's bigger than the viewer.
import { onPageKeys } from './keys.js';

/** The zoom steps − and + move through, as a share of the picture's own size. */
const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

/** A zoom: fit the viewer, or a share of the picture's own size. */
type Zoom = 'fit' | number;

/** The viewer's parts. */
type ImageViewer = {
  readonly stage: HTMLElement;
  readonly image: HTMLImageElement;
};

/** The share of its own size the picture is drawn at now: zoomed, or fitted to the viewer. */
function currentScale(viewer: ImageViewer): number {
  const { image, stage } = viewer;
  if (image.naturalWidth === 0 || image.naturalHeight === 0) {
    return 1;
  }
  if (stage.classList.contains('viewer-stage--zoomed')) {
    return image.getBoundingClientRect().width / image.naturalWidth;
  }
  return Math.min(stage.clientWidth / image.naturalWidth, stage.clientHeight / image.naturalHeight);
}

/** Draws the picture at a zoom, and marks the matching choice (Fit, 100%, 200%) as current. */
function applyZoom(viewer: ImageViewer, zoom: Zoom): void {
  const { image, stage } = viewer;
  const isFit = zoom === 'fit';
  stage.classList.toggle('viewer-stage--zoomed', !isFit);
  image.style.width = isFit ? '' : `${String(Math.round(image.naturalWidth * zoom))}px`;
  for (const choice of document.querySelectorAll<HTMLElement>('[data-zoom-level]')) {
    choice.setAttribute('aria-pressed', String(choice.dataset.zoomLevel === String(zoom)));
  }
}

/** The next zoom step in or out from the current scale. */
function steppedZoom(viewer: ImageViewer, direction: 'in' | 'out'): number {
  const scale = currentScale(viewer);
  const larger = ZOOM_STEPS.find((step) => step > scale + 0.001);
  const smaller = ZOOM_STEPS.toReversed().find((step) => step < scale - 0.001);
  const fallback = direction === 'in' ? ZOOM_STEPS.at(-1) : ZOOM_STEPS[0];
  return (direction === 'in' ? larger : smaller) ?? fallback ?? 1;
}

/** Lets the picture be dragged to scroll the viewer while it's zoomed past the viewer's size. */
function enablePanning(viewer: ImageViewer): void {
  const { stage } = viewer;
  let last: { x: number; y: number } | undefined;
  stage.addEventListener('pointerdown', (event) => {
    if (!stage.classList.contains('viewer-stage--zoomed')) {
      return;
    }
    last = { x: event.clientX, y: event.clientY };
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', (event) => {
    if (last === undefined) {
      return;
    }
    stage.scrollBy(last.x - event.clientX, last.y - event.clientY);
    last = { x: event.clientX, y: event.clientY };
  });
  stage.addEventListener('pointerup', () => {
    last = undefined;
  });
}

/** Wires the zoom buttons, choices and keys to one viewer. */
function enableZoom(viewer: ImageViewer): void {
  for (const button of document.querySelectorAll<HTMLElement>('[data-zoom-step]')) {
    button.addEventListener('click', () => {
      applyZoom(viewer, steppedZoom(viewer, button.dataset.zoomStep === 'in' ? 'in' : 'out'));
    });
  }
  for (const choice of document.querySelectorAll<HTMLElement>('[data-zoom-level]')) {
    choice.addEventListener('click', () => {
      const level = choice.dataset.zoomLevel ?? 'fit';
      applyZoom(viewer, level === 'fit' ? 'fit' : Number(level));
    });
  }
  function zoomIn(): void {
    applyZoom(viewer, steppedZoom(viewer, 'in'));
  }
  onPageKeys({
    '+': zoomIn,
    '=': zoomIn,
    '-': () => {
      applyZoom(viewer, steppedZoom(viewer, 'out'));
    },
    '0': () => {
      applyZoom(viewer, 'fit');
    },
  });
}

const stage = document.querySelector<HTMLElement>('[data-image-stage]');
const image = document.querySelector<HTMLImageElement>('[data-image-viewer]');
if (stage !== null && image !== null) {
  enableZoom({ stage, image });
  enablePanning({ stage, image });
}
