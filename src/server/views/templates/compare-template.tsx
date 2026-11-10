// The compare board (R22): up to four references side by side, in the window of its own that an
// Item page's "add to compare board" opens. No frame draws it, so it is built from the approved
// parts: a panel title bar with the layout choices, then each reference on the viewer's gray.
import { ApiAction, ApiForm } from '../parts/inline-edit.js';

import type { CompareLayout, CompareWindow } from '#core/compare/compare-board.js';

/** What a reference shows: a picture, a playable video, or its thumbnail and why. */
export type ComparePicture =
  | { readonly kind: 'image'; readonly src: string; readonly alt: string }
  | { readonly kind: 'video'; readonly src: string }
  | {
      readonly kind: 'thumbnail';
      readonly src: string;
      readonly alt: string;
      readonly note: string;
    };

/** One reference on the board. */
export type CompareSlot = {
  readonly itemId: number;
  readonly label: string;
  readonly picture: ComparePicture;
  /** Where its [remove] posts. */
  readonly removeAction: string;
};

/** Everything the compare board shows. */
export type CompareModel = {
  readonly layout: CompareLayout;
  readonly limit: number;
  readonly slots: readonly CompareSlot[];
  /** Where the board's window last sat, which client/compare.ts moves a new window to. */
  readonly window: CompareWindow | undefined;
};

/** The layouts, in the order the title bar offers them. */
const LAYOUT_CHOICES: readonly { readonly layout: CompareLayout; readonly label: string }[] = [
  { layout: 'row', label: 'side by side' },
  { layout: 'grid', label: '2 × 2 grid' },
];

/** One layout choice: a one-click form, drawn bold when it is the board's layout. */
function LayoutChoice(props: {
  readonly layout: CompareLayout;
  readonly label: string;
  readonly current: CompareLayout;
}) {
  return (
    <ApiForm action="/api/compare/layout">
      <input type="hidden" name="layout" value={props.layout} />
      <button
        type="submit"
        class="link-button"
        aria-pressed={props.layout === props.current ? 'true' : 'false'}
        disabled={props.layout === props.current}
      >
        {props.label}
      </button>
    </ApiForm>
  );
}

/** The reference's picture, filling its slot without cropping. */
function SlotPicture(props: { readonly picture: ComparePicture }) {
  const { picture } = props;
  switch (picture.kind) {
    case 'image':
      return <img class="compare-slot__picture" src={picture.src} alt={picture.alt} />;
    case 'video':
      return (
        <video
          class="compare-slot__picture"
          src={picture.src}
          controls
          loop
          muted
          preload="metadata"
        />
      );
    case 'thumbnail':
      return <img class="compare-slot__picture" src={picture.src} alt={picture.alt} data-thumb />;
  }
}

/** One reference: its picture on the viewer's gray, then its name, any note and [remove]. */
function Slot(props: { readonly slot: CompareSlot }) {
  const { slot } = props;
  const note = slot.picture.kind === 'thumbnail' ? ` · ${slot.picture.note}` : '';
  return (
    <figure class="compare-slot" data-compare-item={String(slot.itemId)}>
      <div class="compare-slot__stage">
        <SlotPicture picture={slot.picture} />
      </div>
      <figcaption class="compare-slot__caption">
        <span class="compare-slot__name">
          {slot.label}
          {note}
        </span>
        <span>
          [
          <ApiAction
            action={slot.removeAction}
            method="DELETE"
            label="remove"
            name={`Remove ${slot.label}`}
          />
          ]
        </span>
      </figcaption>
    </figure>
  );
}

/** What an empty board says, in the site's voice, as the empty lists do (E1). */
function EmptyBoard(props: { readonly limit: number }) {
  return (
    <div class="empty-state">
      <p class="empty-state__title">Nothing on the compare board.</p>
      <p class="empty-state__line">
        Open a photo, video or Library item and choose “add to compare board”. It holds up to{' '}
        {String(props.limit)} references, and keeps them until you remove them.
      </p>
    </div>
  );
}

/** The whole compare board: title bar with the count and layouts, then the references. */
export function CompareTemplate(props: { readonly model: CompareModel }) {
  const { model } = props;
  const count = model.slots.length;
  const place = model.window;
  const windowPlace =
    place === undefined ? undefined : [place.left, place.top, place.width, place.height].join(',');
  const slotsClass = `compare-board__slots compare-board__slots--${model.layout} compare-board__slots--count-${String(count)}`;
  return (
    <section
      aria-label="Compare board"
      class="panel compare-board"
      data-compare-board
      data-compare-window={windowPlace}
    >
      <h1 class="panel__title panel__title--split">
        <span>
          Compare board · {String(count)} of {String(model.limit)} references
        </span>
        <span class="panel__title-note compare-board__layouts">
          {LAYOUT_CHOICES.map((choice) => (
            <LayoutChoice key={choice.layout} {...choice} current={model.layout} />
          ))}
        </span>
      </h1>
      {count === 0 ? (
        <EmptyBoard limit={model.limit} />
      ) : (
        <div class={slotsClass}>
          {model.slots.map((slot) => (
            <Slot key={slot.itemId} slot={slot} />
          ))}
        </div>
      )}
    </section>
  );
}
