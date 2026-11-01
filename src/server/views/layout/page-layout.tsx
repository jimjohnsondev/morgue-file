// The frame every page shares: banner, tab bar, content and footer.
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
  readonly currentPath: string;
  readonly token: string;
  readonly assets: PageAssets;
  readonly children: ComponentChildren;
};

/** Renders the full HTML document around a page's content. */
export function PageLayout(props: PageLayoutProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
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
        <header class="banner">
          <p class="banner__wordmark">
            MORGUE <span class="banner__wordmark-accent">FILE</span>
          </p>
          <p class="banner__tagline">reference archive of j m johnson</p>
        </header>
        <div class="trim" />
        <nav class="tab-bar">
          {NAV_TABS.map((tab) => (
            <a
              key={tab.href}
              href={tab.href}
              class={tab.href === props.currentPath ? 'tab tab--current' : 'tab'}
            >
              {tab.label}
            </a>
          ))}
          <a href="/settings" class="tab tab--end">
            Settings
          </a>
        </nav>
        <main class="page">{props.children}</main>
        <div class="trim" />
        <footer class="footer">Morgue File</footer>
      </body>
    </html>
  );
}
