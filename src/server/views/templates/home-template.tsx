// The Home page (frame 12): a stack of preview strips beside a side column with the archive's
// counts and the keys worth knowing (R34).
import { formatCount } from '../format.js';
import { Panel } from '../parts/panel.js';
import { PreviewStrip } from '../parts/preview-strip.js';

import type { PreviewStripModel } from '../parts/preview-strip.js';

/** One row of the archive counts: a list and how many it holds. */
export type ArchiveCountRow = {
  readonly label: string;
  readonly href: string;
  readonly count: number;
};

/** Everything Home shows. Strips with nothing in them are left out before they get here. */
export type HomeModel = {
  readonly strips: readonly PreviewStripModel[];
  readonly counts: readonly ArchiveCountRow[];
};

/** The keys that work on every page, as the side column lists them. */
const KEYS = [
  { keys: 'V', action: 'viewing mode on and off' },
  { keys: '← →', action: 'previous and next item' },
] as const;

/** The side column: the archive's counts, then the keys. */
function SideColumn(props: { readonly counts: readonly ArchiveCountRow[] }) {
  return (
    <aside aria-label="At a glance" class="home__side">
      <Panel title="The archive">
        <table class="details-table home__counts">
          <tbody>
            {props.counts.map((row) => (
              <tr key={row.label}>
                <th scope="row">
                  <a href={row.href}>{row.label}</a>
                </th>
                <td>
                  <span class="counter">{formatCount(row.count)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="Keys">
        <dl class="home__keys">
          {KEYS.map((key) => (
            <div key={key.keys}>
              <dt>{key.keys}</dt>
              <dd>{key.action}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </aside>
  );
}

/** The whole Home page body; the layout adds the banner, tabs and footer. */
export function HomeTemplate(props: { readonly model: HomeModel | undefined }) {
  const { model } = props;
  return (
    <div class="home">
      <h1 class="page__title">Welcome back</h1>
      {model === undefined ? (
        <p>The archive isn't open yet.</p>
      ) : (
        <div class="home__body">
          <div class="home__strips">
            {model.strips.length === 0 && <p>Nothing here yet. Files you add will show up here.</p>}
            {model.strips.map((strip) => (
              <PreviewStrip key={strip.title} strip={strip} />
            ))}
          </div>
          <SideColumn counts={model.counts} />
        </div>
      )}
    </div>
  );
}
