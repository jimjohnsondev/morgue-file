// The notices the shared frame shows on any page: the Reference folder offline (E3), the index
// still running (E5), and the notice after a drop (E6), plus the outline shown while dragging.
// The first two sit in slots that /events refreshes while the page is open (client/live-status.ts).
import { formatCount } from '../format.js';

import { FILING_FORM_ID } from './details-panel.js';

import type { IndexingAction } from '../../library-runtime.js';

/** The Reference folder can't be reached: where it should be, and how many items it keeps. */
export type OfflineNotice = {
  readonly folder: string;
  readonly itemCount: number;
};

/** How far the scan has got: files found, how many there are once counted, and if paused. */
export type IndexingNotice = {
  readonly found: number;
  readonly expected: number | undefined;
  readonly isPaused: boolean;
};

/** A file just saved to Unsorted: its item, its name, and the site it came from, if known. */
export type SavedNotice = {
  readonly itemHref: string;
  readonly name: string;
  /** The archive already had the file, so it was linked to this item, not copied (R8). */
  readonly isDuplicate: boolean;
  readonly sourceHost: string | undefined;
  /** The page's own address without the notice, for "dismiss". */
  readonly dismissHref: string;
};

/** Everything the frame may show besides the page itself; each part is left out when idle. */
export type PageStatus = {
  readonly offline?: OfflineNotice | undefined;
  readonly indexing?: IndexingNotice | undefined;
  readonly saved?: SavedNotice | undefined;
};

/**
 * "Indexing 12,400 of 48,000 files", or "Indexing 12,400 files" before the count is in; "Indexing
 * paused at …" while paused.
 */
export function indexingLabel(indexing: IndexingNotice): string {
  const found = formatCount(indexing.found);
  const progress =
    indexing.expected === undefined
      ? `${found} files`
      : `${found} of ${formatCount(indexing.expected)} files`;
  return indexing.isPaused ? `Indexing paused at ${progress}` : `Indexing ${progress}`;
}

/**
 * A link-styled button that asks the server to pause or resume the scan, or to look for the
 * Reference folder now. client/live-status.ts sends it; the next /events update shows the result.
 */
function IndexingActionButton(props: { readonly action: IndexingAction; readonly label: string }) {
  return (
    <button type="button" class="link-button" data-indexing-action={props.action}>
      {props.label}
    </button>
  );
}

/** Pause while the scan runs, Resume while it is paused, in the case the place asks for. */
function PauseButton(props: { readonly isPaused: boolean; readonly isLowerCase: boolean }) {
  const label = props.isPaused ? 'Resume' : 'Pause';
  return (
    <IndexingActionButton
      action={props.isPaused ? 'resume' : 'pause'}
      label={props.isLowerCase ? label.toLowerCase() : label}
    />
  );
}

/** The band under the tabs while the Reference folder is offline (E3). */
export function OfflineBand(props: { readonly offline: OfflineNotice }) {
  const { offline } = props;
  return (
    <div role="status" class="status-band status-band--offline">
      <span>
        <span class="status-band__mark" aria-hidden="true">
          !
        </span>
        <b>Reference folder ({offline.folder}) is offline.</b> {formatCount(offline.itemCount)}{' '}
        {offline.itemCount === 1 ? 'item is' : 'items are'} kept and will reappear when the drive is
        back.
      </span>
      <span class="status-band__links">
        <IndexingActionButton action="check" label="Check again" /> ·{' '}
        <a href="/settings">Change folder location</a>
      </span>
    </div>
  );
}

/** The slim bar under the tabs while the index runs; the page stays usable (E5). */
export function IndexingBar(props: { readonly indexing: IndexingNotice }) {
  const { indexing } = props;
  // Without a total the bar is left indeterminate rather than guessing.
  const expected = indexing.expected === undefined ? undefined : Math.max(1, indexing.expected);
  return (
    <div role="status" class="status-band status-band--indexing">
      <b>{indexingLabel(indexing)}</b>
      <progress
        class="indexing-meter"
        max={expected}
        value={expected === undefined ? undefined : Math.min(indexing.found, expected)}
        aria-label="Indexing progress"
      />
      <span class="caption">newest first · thumbnails for the page you’re on come first</span>
      <PauseButton isPaused={indexing.isPaused} isLowerCase={false} />
    </div>
  );
}

/** The footer's lines while the index runs: files found so far, and the running count. */
export function IndexingFooterLines(props: { readonly indexing: IndexingNotice }) {
  return (
    <>
      <p class="footer__line">
        <span class="counter">{formatCount(props.indexing.found)}</span> files found so far
      </p>
      <p class="footer__line">
        {indexingLabel(props.indexing).toLowerCase()} ·{' '}
        <PauseButton isPaused={props.indexing.isPaused} isLowerCase={true} />
      </p>
    </>
  );
}

/** What the slot under the tabs holds: the offline band and the indexing bar, when they apply. */
export function StatusBands(props: { readonly status: PageStatus }) {
  const { offline, indexing } = props.status;
  return (
    <>
      {offline && <OfflineBand offline={offline} />}
      {indexing && <IndexingBar indexing={indexing} />}
    </>
  );
}

/** What the footer's slot holds: the indexing lines while a scan runs. */
export function StatusFooterLines(props: { readonly status: PageStatus }) {
  const { indexing } = props.status;
  return indexing ? <IndexingFooterLines indexing={indexing} /> : null;
}

/**
 * The notice after a drop of a file the archive already had: it names the item the file was
 * found as, which may be filed anywhere, so it offers no filing links (R8).
 */
function DuplicateNoticePanel(props: { readonly saved: SavedNotice }) {
  const { saved } = props;
  return (
    <section role="status" class="panel saved-notice">
      <h2 class="panel__title">Already in the archive</h2>
      <div class="panel__body saved-notice__body">
        <span>
          <b>{saved.name}</b> · not copied again
        </span>
        <span class="saved-notice__links">
          <a href={saved.itemHref}>Open the item</a> ·{' '}
          <a href={saved.dismissHref} aria-label="Dismiss notice">
            dismiss
          </a>
        </span>
      </div>
    </section>
  );
}

/** The notice after a drop, linking to the item it made (E6), or to the one it already was. */
export function SavedNoticePanel(props: { readonly saved: SavedNotice }) {
  const { saved } = props;
  if (saved.isDuplicate) {
    return <DuplicateNoticePanel saved={saved} />;
  }
  return (
    <section role="status" class="panel saved-notice">
      <h2 class="panel__title">Saved to Unsorted</h2>
      <div class="panel__body saved-notice__body">
        <span>
          <b>{saved.name}</b>
          {saved.sourceHost !== undefined && ` · from ${saved.sourceHost}`}
        </span>
        <span class="saved-notice__links">
          <a href={saved.itemHref}>Open the item</a> ·{' '}
          <a href={`${saved.itemHref}#${FILING_FORM_ID}`}>file it now</a> ·{' '}
          <a href="/unsorted">go to Unsorted</a> ·{' '}
          <a href={saved.dismissHref} aria-label="Dismiss notice">
            dismiss
          </a>
        </span>
      </div>
    </section>
  );
}

/** The outline over the page while a file is dragged onto it; client/drop-outline.ts shows it. */
export function DropOutline() {
  return (
    <div class="drop-outline" data-drop-outline hidden>
      <b class="drop-outline__title" data-drop-outline-title>
        Drop to save to Unsorted
      </b>
      <span class="drop-outline__line" data-drop-outline-line>
        The file is copied into the Inbox folder; the source address is kept when the browser sends
        it.
      </span>
    </div>
  );
}
