// The breadcrumb above every Index page title: Home › Photos › Figure.
import { Fragment } from 'preact';

/** One step of the trail; the last one, the page itself, has no link. */
export type Crumb = {
  readonly label: string;
  readonly href?: string;
};

/** The trail of links back up from a page, separated by ›. */
export function Breadcrumb(props: { readonly crumbs: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" class="breadcrumb">
      {props.crumbs.map((crumb, index) => (
        <Fragment key={crumb.label}>
          {index > 0 && ' › '}
          {crumb.href === undefined ? <b>{crumb.label}</b> : <a href={crumb.href}>{crumb.label}</a>}
        </Fragment>
      ))}
    </nav>
  );
}
