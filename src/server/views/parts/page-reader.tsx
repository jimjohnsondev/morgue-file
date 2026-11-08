// The page reader for Library items (frame 8, R21): one page or a two-page spread on the viewer
// gray, links through the spreads, a single or spread toggle, jump-to-page, and a strip of every
// page. CBZ files and page folders show page pictures, with small ones in the strip; PDFs are
// drawn by src/client/reader.ts with pdf.js, onto the canvases this leaves for them.
import { ViewerPanel } from './viewers.js';

import type { ViewerFrame } from './viewers.js';

/** A link the reader's toolbar shows, or plain text when there's nowhere to go (the last page). */
export type ReaderLink = { readonly label: string; readonly href: string | undefined };

/** Everything the reader shows. */
export type PageReaderModel = ViewerFrame & {
  readonly kind: 'reader';
  /** PDFs are drawn in the browser; the others are page pictures from the server. */
  readonly source: 'pdf' | 'pictures';
  /** The original for pdf.js, or the page pictures' address before the page number. */
  readonly src: string;
  /** The strip's small picture of a page; only page pictures have them. */
  readonly stripPictureSrc: (page: number) => string;
  readonly pageCount: number;
  /** The pages on show: one, or a spread of two. */
  readonly shownPages: readonly number[];
  /** "Pages 12–13", "Page 1". */
  readonly shownLabel: string;
  readonly isSpread: boolean;
  readonly first: ReaderLink;
  readonly previous: ReaderLink;
  readonly next: ReaderLink;
  readonly last: ReaderLink;
  readonly singleHref: string;
  readonly spreadHref: string;
  /** The page strip's link for each page. */
  readonly pageHref: (page: number) => string;
  /** The jump-to-page form's action and the view settings it keeps. */
  readonly jump: { readonly action: string; readonly keep: Readonly<Record<string, string>> };
};

/** A link, or its label in plain text when it has nowhere to go. A key may follow it too. */
function MaybeLink(props: { readonly link: ReaderLink; readonly keyLink?: string }) {
  const { link } = props;
  return link.href === undefined ? (
    <span>{link.label}</span>
  ) : (
    <a href={link.href} data-key-link={props.keyLink}>
      {link.label}
    </a>
  );
}

/** One page: a picture from the server, or a canvas the client draws a PDF page onto. */
function ReaderPage(props: {
  readonly model: PageReaderModel;
  readonly page: number;
  readonly variant: 'stage' | 'strip';
}) {
  const { model, page, variant } = props;
  const className = variant === 'stage' ? 'reader-page' : 'page-strip__page';
  if (model.source === 'pdf') {
    return (
      <canvas
        class={className}
        // A page-shaped space until the client draws the page and sets its real size. The strip's
        // fixed CSS size overrides it for strip pages.
        width="400"
        height="600"
        data-pdf-page={String(page)}
        role="img"
        aria-label={`Page ${String(page)}`}
      />
    );
  }
  if (variant === 'strip') {
    return <img class={className} src={model.stripPictureSrc(page)} alt="" loading="lazy" />;
  }
  return (
    <img
      class={className}
      src={`${model.src}/${String(page)}`}
      alt={`Page ${String(page)}`}
      loading="eager"
    />
  );
}

/** The toolbar: first, previous, the pages shown, next, last; then the view and jump-to-page. */
function ReaderToolbar(props: { readonly model: PageReaderModel }) {
  const { model } = props;
  return (
    <div class="viewer-toolbar">
      <span class="reader-nav">
        « <MaybeLink link={model.first} /> · ‹{' '}
        <MaybeLink link={model.previous} keyLink="page-previous" /> · <b>{model.shownLabel}</b> of{' '}
        {model.pageCount} · <MaybeLink link={model.next} keyLink="page-next" /> › ·{' '}
        <MaybeLink link={model.last} /> »
      </span>
      <span class="viewer-toolbar__group">
        View: {model.isSpread ? <a href={model.singleHref}>Single</a> : <b>Single</b>} ·{' '}
        {model.isSpread ? <b>Spread</b> : <a href={model.spreadHref}>Spread</a>}
        <form method="get" action={model.jump.action} class="reader-jump">
          {Object.entries(model.jump.keep).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <label for="reader-page">Go to page</label>
          <input
            id="reader-page"
            name="page"
            type="number"
            min="1"
            max={String(model.pageCount)}
            class="field reader-jump__field"
            required
          />
          <button type="submit" class="button">
            Go
          </button>
        </form>
      </span>
    </div>
  );
}

/** The page reader: toolbar, the pages on the viewer gray, and the strip of every page. */
export function PageReader(props: { readonly model: PageReaderModel }) {
  const { model } = props;
  const pages = Array.from({ length: model.pageCount }, (_, index) => index + 1);
  return (
    <ViewerPanel frame={model} label="Page reader">
      <ReaderToolbar model={model} />
      <div
        class="viewer-stage reader-stage"
        data-reader
        data-reader-source={model.source}
        data-reader-src={model.src}
      >
        {model.shownPages.map((page) => (
          <ReaderPage key={page} model={model} page={page} variant="stage" />
        ))}
      </div>
      <nav aria-label="Pages" class="page-strip">
        <ol class="page-strip__list">
          {pages.map((page) => (
            <li key={page}>
              <a
                href={model.pageHref(page)}
                class="page-strip__link"
                aria-label={`Page ${String(page)}`}
                aria-current={model.shownPages.includes(page) ? 'page' : undefined}
              >
                <ReaderPage model={model} page={page} variant="strip" />
                <span class="page-strip__number">{page}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </ViewerPanel>
  );
}
