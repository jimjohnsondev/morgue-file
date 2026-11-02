// The boxed panel with a gradient title bar that settings, setup and the side panels share.
import type { ComponentChildren } from 'preact';

/** What a panel shows: its title and its contents. */
export type PanelProps = {
  readonly title: string;
  readonly children: ComponentChildren;
};

/** A panel: 1 px border, white inner highlight, hard offset shadow, titled with a cyan square. */
export function Panel(props: PanelProps) {
  return (
    <section class="panel">
      <h2 class="panel__title">{props.title}</h2>
      <div class="panel__body">{props.children}</div>
    </section>
  );
}
