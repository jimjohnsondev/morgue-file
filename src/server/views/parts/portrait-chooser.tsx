// The portrait chooser on the profile editor (frame 14): the model's photos, one radio button
// each, the chosen one framed in magenta. The portrait can be any photo in the archive (R14), so
// the current one shows here even when the model isn't linked to it.
import type { StripLink } from './preview-strip.js';
import type { PortraitChoice } from '../templates/model-edit-template.js';

/** One photo to choose, with its file name beside its radio button. */
function Choice(props: { readonly choice: PortraitChoice }) {
  const { choice } = props;
  return (
    <label class="portrait-choice">
      <span class="thumb">
        <img class="thumb__image" src={choice.imageSrc} alt="" data-thumb />
      </span>
      <span class="portrait-choice__name">
        <input
          type="radio"
          name="portrait"
          value={String(choice.itemId)}
          checked={choice.isChosen}
        />{' '}
        {choice.fileName}
      </span>
    </label>
  );
}

/** The chooser, titled with the model's first name as frame 14 is, and a link to more photos. */
export function PortraitChooser(props: {
  readonly firstName: string;
  readonly choices: readonly PortraitChoice[];
  readonly more: StripLink | undefined;
}) {
  const { firstName, choices, more } = props;
  return (
    <fieldset id="portrait" class="portrait-chooser">
      <legend class="portrait-chooser__title">Portrait · pick any photo of {firstName}</legend>
      {choices.length === 0 ? (
        <p class="caption">
          No photos of {firstName} yet. Link some to {firstName} from Photos, then pick one here.
        </p>
      ) : (
        <div class="portrait-chooser__photos">
          {choices.map((choice) => (
            <Choice key={choice.itemId} choice={choice} />
          ))}
          {more && (
            <a href={more.href} class="portrait-chooser__more">
              {more.text}
            </a>
          )}
        </div>
      )}
    </fieldset>
  );
}
