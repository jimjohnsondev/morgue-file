// The grid of matted thumbnails with a caption under each, running edge to edge and wrapping.
// In selection mode (frame 13) each card has a tick box at its top left, and clicking a card
// selects it instead of opening it (client/selection.ts).
import type { SquareSizeName } from '#core/jobs/thumbnail-files.js';

/** One thumbnail: where it links, its image, its shape and the two caption lines under it. */
export type ThumbCard = {
  readonly key: string;
  readonly href: string;
  /** Undefined draws an empty mat, for a model with no portrait or an empty collection. */
  readonly imageSrc: string | undefined;
  /** Photos and videos are squares; Library items are tall covers. */
  readonly shape: 'square' | 'cover';
  readonly label: string;
  readonly details: string;
  /** The item a card stands for, on lists whose items can be selected. */
  readonly itemId?: number;
  /** The item's tags, for the action panel's "on all selected" line. */
  readonly tags?: readonly string[];
};

/** The grid's thumbnails and the square size chosen. Covers have one size. */
export type ThumbGridProps = {
  readonly cards: readonly ThumbCard[];
  readonly size: SquareSizeName;
  /** Draws a tick box on every card that stands for an item (frame 13). */
  readonly isSelecting?: boolean;
};

/** The matted image, linking to the card's page. */
function Thumb(props: { readonly card: ThumbCard }) {
  const { card } = props;
  return (
    <a href={card.href} class="thumb" aria-label={card.label}>
      {card.imageSrc === undefined ? (
        <span class="thumb__image" />
      ) : (
        <img class="thumb__image" src={card.imageSrc} alt="" data-thumb />
      )}
    </a>
  );
}

/** A card in selection mode: the tick box over its corner, and its name as plain text. */
function SelectableCard(props: { readonly card: ThumbCard; readonly itemId: number }) {
  const { card } = props;
  return (
    <li
      class={`thumb-card thumb-card--${card.shape} thumb-card--selectable`}
      data-select-card
      data-tags={JSON.stringify(card.tags ?? [])}
    >
      <Thumb card={card} />
      <label class="thumb-card__tick">
        <input
          type="checkbox"
          value={props.itemId}
          aria-label={`Select ${card.label}`}
          data-select-item
        />
      </label>
      <span class="thumb-card__label">{card.label}</span>
      <span class="caption">{card.details}</span>
    </li>
  );
}

/** Draws the cards in a wrapping grid, bottoms aligned so squares and covers can share a row. */
export function ThumbGrid(props: ThumbGridProps) {
  return (
    <ul class={`thumb-grid thumb-grid--${props.size}`}>
      {props.cards.map((card) =>
        props.isSelecting === true && card.itemId !== undefined ? (
          <SelectableCard key={card.key} card={card} itemId={card.itemId} />
        ) : (
          <li key={card.key} class={`thumb-card thumb-card--${card.shape}`}>
            <Thumb card={card} />
            <a href={card.href} class="thumb-card__label">
              {card.label}
            </a>
            <span class="caption">{card.details}</span>
          </li>
        ),
      )}
    </ul>
  );
}
