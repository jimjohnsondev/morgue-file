// The Model profile template (frame 10): the portrait, the model's fields and tags, where the
// model appears, then one preview strip per section the model appears in (R16).
import { Fragment } from 'preact';

import { Breadcrumb } from '../parts/breadcrumb.js';
import { FieldText } from '../parts/field-text.js';
import { PreviewStrip } from '../parts/preview-strip.js';

import type { FieldType } from '#core/db/repositories/fields.js';
import type { Crumb } from '../parts/breadcrumb.js';
import type { PreviewStripModel, StripLink } from '../parts/preview-strip.js';

/** The photo chosen as the portrait, and the item it comes from. */
export type PortraitModel = {
  readonly imageSrc: string;
  readonly shape: 'square' | 'cover';
  readonly itemHref: string;
  readonly fileName: string;
};

/** One row of the profile's fields table, rendered by its type (R14). */
export type ProfileField = {
  readonly key: string;
  readonly label: string;
  readonly type: FieldType;
  readonly text: string | undefined;
};

/** Everything a Model profile page shows. */
export type ModelProfileModel = {
  readonly name: string;
  /** The profile editor's address (frame 14). */
  readonly editHref: string;
  readonly breadcrumb: readonly Crumb[];
  readonly portrait: PortraitModel | undefined;
  readonly fields: readonly ProfileField[];
  readonly tags: readonly string[];
  /** One link per section the model appears in: "Photos (212)". */
  readonly appearsIn: readonly StripLink[];
  readonly strips: readonly PreviewStripModel[];
};

/** The portrait in its mat, with the file it comes from underneath. */
function Portrait(props: {
  readonly portrait: PortraitModel | undefined;
  readonly chooseHref: string;
}) {
  const { portrait, chooseHref } = props;
  if (portrait === undefined) {
    return (
      <figure class="profile__portrait profile__portrait--none">
        <figcaption class="caption">
          No portrait yet [<a href={chooseHref}>choose</a>]
        </figcaption>
      </figure>
    );
  }
  return (
    <figure class={`profile__portrait profile__portrait--${portrait.shape}`}>
      <a href={portrait.itemHref} class="thumb" aria-label={`Portrait: ${portrait.fileName}`}>
        <img class="thumb__image" src={portrait.imageSrc} alt="" data-thumb />
      </a>
      <figcaption class="caption">
        portrait from <a href={portrait.itemHref}>{portrait.fileName}</a> [
        <a href={chooseHref}>change</a>]
      </figcaption>
    </figure>
  );
}

/** The cyan notice listing the sections the model appears in, each linking to its list. */
function AppearsIn(props: { readonly links: readonly StripLink[] }) {
  if (props.links.length === 0) {
    return <p class="notice profile__appears">Not linked to any items yet.</p>;
  }
  return (
    <p class="notice profile__appears">
      <b>Appears in:</b>{' '}
      {props.links.map((link, index) => (
        <Fragment key={link.href}>
          {index > 0 && ' · '}
          <a href={link.href}>{link.text}</a>
        </Fragment>
      ))}
    </p>
  );
}

/** The profile panel: portrait beside the fields table, model tags and where the model appears. */
function ProfilePanel(props: { readonly model: ModelProfileModel }) {
  const { model } = props;
  return (
    <section aria-label="Profile" class="panel profile">
      <h2 class="panel__title">Model profile</h2>
      <div class="panel__body profile__body">
        <Portrait portrait={model.portrait} chooseHref={`${model.editHref}#portrait`} />
        <div class="profile__details">
          <table class="details-table profile__fields">
            <tbody>
              {model.fields.map((field) => (
                <tr key={field.key}>
                  <th scope="row">{field.label}</th>
                  <td>
                    <FieldText type={field.type} text={field.text} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div class="profile__tags">
            <b>Model tags:</b>
            {model.tags.map((tag) => (
              <span key={tag} class="chip">
                {tag}
              </span>
            ))}
            <a href={`${model.editHref}#model-tags`}>add tag</a>
          </div>
          <AppearsIn links={model.appearsIn} />
        </div>
      </div>
    </section>
  );
}

/** The whole Model profile page body; the layout adds the banner, tabs and footer. */
export function ModelProfileTemplate(props: { readonly model: ModelProfileModel }) {
  const { model } = props;
  return (
    <div class="index-page">
      <Breadcrumb crumbs={model.breadcrumb} />
      <div class="index-page__heading">
        <h1 class="page__title">{model.name}</h1>
        <span class="caption">
          <a href={model.editHref}>edit profile</a> ·{' '}
          <a href="/settings#fields">edit fields for all models</a>
        </span>
      </div>
      <ProfilePanel model={model} />
      {model.strips.map((strip) => (
        <PreviewStrip key={strip.title} strip={strip} />
      ))}
    </div>
  );
}
