// The Index template (R18): breadcrumb, title and count, the filter panel, then the paged grid,
// always in that order. Every list in the app is one of these.
import { Fragment } from 'preact';

import { formatCount } from '../format.js';
import { Breadcrumb } from '../parts/breadcrumb.js';
import { FilterPanel } from '../parts/filter-panel.js';
import { Pager } from '../parts/pager.js';
import { SelectionPanel } from '../parts/selection-panel.js';
import { ThumbGrid } from '../parts/thumb-grid.js';

import type { SquareSizeName } from '#core/jobs/thumbnail-files.js';
import type { Crumb } from '../parts/breadcrumb.js';
import type { FilterPanelModel } from '../parts/filter-panel.js';
import type { SelectionPanelModel } from '../parts/selection-panel.js';
import type { ThumbCard } from '../parts/thumb-grid.js';
import type { ComponentChildren } from 'preact';

/** A run of thumbnails under an optional heading: a year of issues, or the whole page. */
export type CardGroup = {
  readonly heading?: string;
  readonly caption?: string;
  readonly cards: readonly ThumbCard[];
};

/** A filter in force, shown as a chip whose [x] link drops it (frame 4). */
export type ActiveFilter = {
  readonly label: string;
  readonly removeHref: string;
};

/** A plain link: its words and where it goes. */
export type TextLink = {
  readonly label: string;
  readonly href: string;
};

/**
 * What an empty list says after its one line, in the site's voice: how to add things (E1), or
 * the search again without each of its terms in turn (E2), then a few links on.
 */
export type EmptyHelp = {
  readonly line?: string;
  /** One link per term: the query without it, labelled with the term's own text. */
  readonly without?: readonly { readonly term: string; readonly href: string }[];
  readonly links: readonly TextLink[];
};

/** The toolbar's links: thumbnail sizes and per-page counts, each with its href. */
export type ToolbarModel = {
  readonly sizes: readonly { label: string; href: string; isCurrent: boolean }[] | undefined;
  readonly perPage: readonly { label: string; href: string; isCurrent: boolean }[] | undefined;
  /** Plain text in place of the choices, for grouped lists ("Group by: Year"). */
  readonly note?: string;
  /** "Select items to tag", on lists whose items can be selected (frame 1). */
  readonly selectHref?: string | undefined;
};

/** Everything an Index page shows. */
export type IndexModel = {
  readonly title: string;
  /** The query echoed after the title on search pages, in the query font. */
  readonly echo?: string;
  readonly breadcrumb: readonly Crumb[];
  readonly caption: ComponentChildren;
  readonly panelTitle: string;
  readonly size: SquareSizeName;
  readonly groups: readonly CardGroup[];
  readonly emptyText: string;
  readonly emptyHelp?: EmptyHelp | undefined;
  readonly toolbar: ToolbarModel;
  /** The pager, for lists longer than one page; grouped lists show everything. */
  readonly paging:
    { page: number; lastPage: number; hrefFor: (page: number) => string } | undefined;
  readonly filterPanel: FilterPanelModel | undefined;
  readonly showFiltersHref: string | undefined;
  readonly activeFilters: { filters: readonly ActiveFilter[]; clearHref: string } | undefined;
  /** The models a search's words found by their fields or tags, as profile links. */
  readonly matchedModels?: readonly TextLink[] | undefined;
  /** The action panel, while the list is in selection mode (frame 13). */
  readonly selection?: SelectionPanelModel | undefined;
};

/** Small · Medium · Large and 48 · 96 · 192, the current one in bold. */
function ToolbarLinks(props: { readonly links: NonNullable<ToolbarModel['perPage']> }) {
  return (
    <>
      {props.links.map((link, index) => (
        <Fragment key={link.label}>
          {index > 0 && ' · '}
          {link.isCurrent ? <b>{link.label}</b> : <a href={link.href}>{link.label}</a>}
        </Fragment>
      ))}
    </>
  );
}

/** The line above the grid: view choices on the left, the pager on the right. */
function Toolbar(props: { readonly model: IndexModel }) {
  const { toolbar, paging } = props.model;
  return (
    <div class="list-toolbar">
      <span>
        {toolbar.sizes && (
          <span class="list-toolbar__choice">
            Thumbnails: <ToolbarLinks links={toolbar.sizes} />
          </span>
        )}
        {toolbar.perPage && (
          <span class="list-toolbar__choice">
            Per page: <ToolbarLinks links={toolbar.perPage} />
          </span>
        )}
        {toolbar.note !== undefined && <span class="list-toolbar__choice">{toolbar.note}</span>}
        {toolbar.selectHref !== undefined && (
          <span class="list-toolbar__choice">
            <a href={toolbar.selectHref}>Select items to tag</a>
          </span>
        )}
      </span>
      {paging && <Pager {...paging} />}
    </div>
  );
}

/** "Models: Elena Varga · …", one line of profile links above a search's items. */
function MatchedModels(props: { readonly links: readonly TextLink[] }) {
  return (
    <p class="matched-models">
      <b>Models:</b>{' '}
      {props.links.map((link, index) => (
        <Fragment key={link.href}>
          {index > 0 && ' · '}
          <a href={link.href}>{link.label}</a>
        </Fragment>
      ))}
    </p>
  );
}

/** The chips for the filters in force, each with its [x] link, and "clear all". */
function ActiveFilters(props: { readonly active: NonNullable<IndexModel['activeFilters']> }) {
  return (
    <div class="active-filters">
      <b>Active filters:</b>
      {props.active.filters.map((filter) => (
        <span key={filter.label} class="chip">
          {filter.label}{' '}
          <a href={filter.removeHref} aria-label={`Remove filter ${filter.label}`}>
            [x]
          </a>
        </span>
      ))}
      <a href={props.active.clearHref}>clear all</a>
    </div>
  );
}

/** The links of an empty list's help, separated by middle dots. */
function DottedLinks(props: { readonly links: readonly TextLink[] }) {
  return (
    <p class="empty-state__links">
      {props.links.map((link, index) => (
        <Fragment key={link.href}>
          {index > 0 && ' · '}
          <a href={link.href}>{link.label}</a>
        </Fragment>
      ))}
    </p>
  );
}

/** What an empty list shows in place of the grid (E1, E2). */
function EmptyState(props: { readonly text: string; readonly help: EmptyHelp | undefined }) {
  const { help } = props;
  const without = help?.without ?? [];
  return (
    <div class={without.length > 0 ? 'empty-state' : 'empty-state empty-state--centered'}>
      <p class="empty-state__title">{props.text}</p>
      {help?.line !== undefined && <p class="empty-state__line">{help.line}</p>}
      {without.length > 0 && (
        <>
          <p class="empty-state__line">Try the search without one of its parts:</p>
          <div class="empty-state__chips">
            {without.map((link) => (
              <a key={link.href} class="chip" href={link.href}>
                without <code>{link.term}</code>
              </a>
            ))}
          </div>
        </>
      )}
      {help && help.links.length > 0 && <DottedLinks links={help.links} />}
    </div>
  );
}

/** The grid panel: its title bar, the toolbar, the groups of thumbnails and the lower pager. */
function GridPanel(props: { readonly model: IndexModel }) {
  const { model } = props;
  const hasCards = model.groups.some((group) => group.cards.length > 0);
  return (
    <section aria-label="Items" class="panel grid-panel">
      <h2 class="panel__title panel__title--split">
        <span>{model.panelTitle}</span>
        {model.showFiltersHref === undefined ? (
          model.paging && (
            <span class="panel__title-note">
              page {model.paging.page} of {model.paging.lastPage}
            </span>
          )
        ) : (
          <a href={model.showFiltersHref}>» show filters</a>
        )}
      </h2>
      <div class="panel__body grid-panel__body">
        <Toolbar model={model} />
        {!hasCards && <EmptyState text={model.emptyText} help={model.emptyHelp} />}
        {model.groups.map((group) => (
          <section key={group.heading ?? 'all'} class="card-group" aria-label={group.heading}>
            {group.heading !== undefined && (
              <h3 class="card-group__heading">
                {group.heading} <span class="caption">· {group.caption}</span>
              </h3>
            )}
            <ThumbGrid
              cards={group.cards}
              size={model.size}
              isSelecting={model.selection !== undefined}
            />
          </section>
        ))}
        {model.paging && (
          <div class="grid-panel__footer">
            <Pager {...model.paging} />
          </div>
        )}
      </div>
    </section>
  );
}

/** The whole Index page body; the layout adds the banner, tabs and footer. */
export function IndexTemplate(props: { readonly model: IndexModel }) {
  const { model } = props;
  return (
    <div class="index-page">
      <Breadcrumb crumbs={model.breadcrumb} />
      <div class="index-page__heading">
        <h1 class="page__title">
          {model.title}
          {model.echo !== undefined && <code class="page__title-query">{model.echo}</code>}
        </h1>
        <span class="caption">{model.caption}</span>
      </div>
      {model.activeFilters && <ActiveFilters active={model.activeFilters} />}
      {model.matchedModels && model.matchedModels.length > 0 && (
        <MatchedModels links={model.matchedModels} />
      )}
      {model.selection && <SelectionPanel model={model.selection} />}
      <div class="index-page__body">
        {model.filterPanel && <FilterPanel model={model.filterPanel} />}
        <GridPanel model={model} />
      </div>
    </div>
  );
}

/** Writes "1,236 items", "1 item", for titles and captions. */
export function countLabel(count: number, noun: string): string {
  return `${formatCount(count)} ${count === 1 ? noun : `${noun}s`}`;
}
