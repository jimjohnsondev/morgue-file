// A Settings panel: a titled box with a note at the right of its title bar, reachable by anchor.
import type { ComponentChildren } from 'preact';

/** A panel of the Settings page, its title bar ending in a short note ("each item has exactly one"). */
export function SettingsPanel(props: {
  readonly id: string;
  readonly title: string;
  readonly note: string;
  readonly children: ComponentChildren;
}) {
  return (
    <section id={props.id} aria-label={props.title} class="panel settings-panel">
      <h2 class="panel__title panel__title--split">
        <span>{props.title}</span>
        <span class="panel__title-note">{props.note}</span>
      </h2>
      <div class="panel__body settings-panel__body">{props.children}</div>
    </section>
  );
}
