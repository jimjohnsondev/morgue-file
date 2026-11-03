// The frame every page shares: banner with the search box, tab bar, content and footer.
import { formatCount, formatDay } from '../format.js';

import type { ArchiveCounts } from '#core/db/repositories/archive-counts.js';
import type { PageAssets } from '../../assets.js';
import type { ComponentChildren } from 'preact';

/** The main nav tabs, in the order the design brief lists them. Settings sits at the right end. */
const NAV_TABS = [
  { href: '/', label: 'Home' },
  { href: '/photos', label: 'Photos' },
  { href: '/video', label: 'Video' },
  { href: '/library', label: 'Library' },
  { href: '/models', label: 'Models' },
  { href: '/collections', label: 'Collections' },
  { href: '/unsorted', label: 'Unsorted' },
  { href: '/search', label: 'Search' },
] as const;

/** What a page passes to the shared layout. */
export type PageLayoutProps = {
  readonly title: string;
  /** The tab the page belongs to, by its href. */
  readonly currentPath: string;
  readonly token: string;
  readonly assets: PageAssets;
  /** The archive's totals for the tab bar and footer; left out before the library is open. */
  readonly counts?: ArchiveCounts | undefined;
  /** The query to show in the banner's search box, on search pages. */
  readonly searchText?: string | undefined;
  readonly children: ComponentChildren;
};

/** The banner: the wordmark and tagline over the artwork, and the search box at the right. */
function Banner(props: { readonly searchText: string | undefined }) {
  return (
    <header class="banner">
      <div class="banner__titles">
        <a href="/" class="banner__wordmark">
          MORGUE<span class="banner__wordmark-accent">FILE</span>
        </a>
        <span class="banner__tagline">reference archive of j m johnson</span>
      </div>
      <form role="search" action="/search" method="get" class="panel banner__search">
        <h2 class="panel__title">Search the archive</h2>
        <div class="panel__body banner__search-row">
          <label for="banner-q" class="caption">
            Find
          </label>
          <input
            id="banner-q"
            name="q"
            class="field banner__search-field"
            value={props.searchText ?? ''}
          />
          <button type="submit" class="button">
            Go
          </button>
        </div>
      </form>
    </header>
  );
}

/** The tab bar. Unsorted shows how many items wait to be filed. */
function TabBar(props: { readonly currentPath: string; readonly unsorted: number | undefined }) {
  return (
    <nav aria-label="Main" class="tab-bar">
      {NAV_TABS.map((tab) => {
        const label =
          tab.href === '/unsorted' && props.unsorted !== undefined
            ? `${tab.label} (${formatCount(props.unsorted)})`
            : tab.label;
        return (
          <a
            key={tab.href}
            href={tab.href}
            class={tab.href === props.currentPath ? 'tab tab--current' : 'tab'}
          >
            {label}
          </a>
        );
      })}
      <a
        href="/settings"
        class={props.currentPath === '/settings' ? 'tab tab--end tab--current' : 'tab tab--end'}
      >
        Settings
      </a>
    </nav>
  );
}

/** The footer counter and the "site last updated" line of a personal site. */
function Footer(props: { readonly counts: ArchiveCounts | undefined }) {
  const { counts } = props;
  if (counts === undefined) {
    return <footer class="footer">Morgue File</footer>;
  }
  return (
    <footer class="footer">
      <p class="footer__line">
        <span class="counter">{formatCount(counts.images)}</span> images ·{' '}
        <span class="counter">{formatCount(counts.videos)}</span> videos ·{' '}
        <span class="counter">{formatCount(counts.publications)}</span> publications in{' '}
        <span class="counter">{formatCount(counts.collections)}</span> collections
      </p>
      {counts.lastUpdatedAt !== undefined && (
        <p class="footer__line">site last updated {formatDay(counts.lastUpdatedAt)}</p>
      )}
    </footer>
  );
}

/** Renders the full HTML document around a page's content. */
export function PageLayout(props: PageLayoutProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width" />
        <meta name="morgue-token" content={props.token} />
        <title>{`${props.title} · Morgue File`}</title>
        {props.assets.styles.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
        {props.assets.scripts.map((src) => (
          <script key={src} type="module" src={src} />
        ))}
      </head>
      <body>
        <Banner searchText={props.searchText} />
        <div class="trim" />
        <TabBar currentPath={props.currentPath} unsorted={props.counts?.unsorted} />
        <main class="page">{props.children}</main>
        <div class="trim" />
        <Footer counts={props.counts} />
      </body>
    </html>
  );
}
