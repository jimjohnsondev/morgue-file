// A preview strip: a titled panel holding a few thumbnails and a link to the full list. Model
// profiles show one per section (R16) and Home is a stack of them (R34).
import { ThumbGrid } from './thumb-grid.js';

import type { ThumbCard } from './thumb-grid.js';

/** A link with its text, such as "view all »". */
export type StripLink = {
  readonly text: string;
  readonly href: string;
};

/** One strip: its title, the link in its title bar, its cards and the link after them. */
export type PreviewStripModel = {
  readonly title: string;
  /** What a screen reader calls the strip, when the title alone is too short. */
  readonly name: string;
  readonly titleLink: StripLink;
  readonly moreLink: StripLink;
  readonly cards: readonly ThumbCard[];
};

/** Draws a strip at the default thumbnail size, the full-list link closing the row. */
export function PreviewStrip(props: { readonly strip: PreviewStripModel }) {
  const { strip } = props;
  return (
    <section aria-label={strip.name} class="panel preview-strip">
      <h2 class="panel__title panel__title--split">
        <span>{strip.title}</span>
        <a href={strip.titleLink.href}>{strip.titleLink.text}</a>
      </h2>
      <div class="panel__body preview-strip__body">
        <ThumbGrid cards={strip.cards} size="medium" />
        <a href={strip.moreLink.href} class="preview-strip__more">
          {strip.moreLink.text}
        </a>
      </div>
    </section>
  );
}
