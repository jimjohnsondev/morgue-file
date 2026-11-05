// The viewer slot when an item's original can't be opened (E4): its drive is offline, or the last
// scan didn't find the file. The cached thumbnail stands in, enlarged, with a note saying why.
import type { ViewerFrame } from './viewers.js';

/** An item whose original can't be opened right now, shown by its cached thumbnail. */
export type UnavailableViewerModel = ViewerFrame & {
  readonly kind: 'unavailable';
  readonly reason: 'offline' | 'missing';
  readonly thumbSrc: string;
  readonly shape: 'square' | 'cover';
  readonly alt: string;
  /** Where the original lives, in the form the Reference folder was given. */
  readonly filePath: string;
  readonly tryAgainHref: string;
  readonly back: { readonly label: string; readonly href: string };
};

/** Why the file can't be opened, in the site's voice. */
function reasonText(model: UnavailableViewerModel): string {
  return model.reason === 'offline'
    ? `The file lives at ${model.filePath}, and that drive is offline.`
    : `The file was at ${model.filePath}, and the last scan didn’t find it there.`;
}

/** The cached thumbnail, enlarged, beside the note about the original. */
export function UnavailableViewer(props: { readonly model: UnavailableViewerModel }) {
  const { model } = props;
  return (
    <section aria-label="Viewer" class="panel viewer-panel">
      <h2 class="panel__title">{model.title}</h2>
      <div class="viewer-stage unavailable-viewer">
        <img
          class={`unavailable-viewer__thumb unavailable-viewer__thumb--${model.shape}`}
          src={model.thumbSrc}
          alt={`${model.alt}, cached thumbnail, enlarged`}
          data-thumb
        />
        <section class="panel unavailable-viewer__note">
          <h3 class="panel__title">Original unavailable</h3>
          <div class="panel__body unavailable-viewer__body">
            <b>The original can’t be opened right now.</b>
            <span>
              This is the cached thumbnail, enlarged. {reasonText(model)} Tags, notes and
              collections are safe.
            </span>
            <span class="unavailable-viewer__links">
              <a href={model.tryAgainHref}>Try again</a> ·{' '}
              <a href={model.back.href}>Back to {model.back.label}</a>
            </span>
          </div>
        </section>
      </div>
    </section>
  );
}
