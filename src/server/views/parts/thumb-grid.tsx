// The grid of matted thumbnails with a caption under each, running edge to edge and wrapping.
import type { SquareSizeName } from '#core/jobs/thumbnail-files.js';

/** One thumbnail: where it links, its image, its shape and the two caption lines under it. */
export type ThumbCard = {
  readonly key: string;
  readonly href: string;
  readonly imageSrc: string;
  /** Photos and videos are squares; Library items are tall covers. */
  readonly shape: 'square' | 'cover';
  readonly label: string;
  readonly details: string;
};

/** The grid's thumbnails and the square size chosen. Covers have one size. */
export type ThumbGridProps = {
  readonly cards: readonly ThumbCard[];
  readonly size: SquareSizeName;
};

/** Draws the cards in a wrapping grid, bottoms aligned so squares and covers can share a row. */
export function ThumbGrid(props: ThumbGridProps) {
  return (
    <ul class={`thumb-grid thumb-grid--${props.size}`}>
      {props.cards.map((card) => (
        <li key={card.key} class={`thumb-card thumb-card--${card.shape}`}>
          <a href={card.href} class="thumb" aria-label={card.label}>
            <img class="thumb__image" src={card.imageSrc} alt="" data-thumb />
          </a>
          <a href={card.href} class="thumb-card__label">
            {card.label}
          </a>
          <span class="caption">{card.details}</span>
        </li>
      ))}
    </ul>
  );
}
