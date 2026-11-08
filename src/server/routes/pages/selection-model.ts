// Selection mode on an Index page (frame 13): the "Select items to tag" link, the action panel
// above the grid and the tags each card carries, read from the library.
import { findModelNames } from '#core/db/repositories/archive-counts.js';
import { findCollectionSummaries } from '#core/db/repositories/collections.js';
import { findSubcategoriesBySection } from '#core/db/repositories/subcategories.js';
import { findTagNamesByItems } from '#core/db/repositories/tags.js';
import { queryToText } from '#core/query/canonical-query.js';

import { formatCount } from '../../views/format.js';

import { SECTION_LABELS } from './filter-choices.js';
import { listHref } from './list-view.js';

import type { Db } from '#core/db/connection.js';
import type { Section } from '#core/db/repositories/items.js';
import type { ListSpec } from './list-model.js';
import type { ListView } from './list-view.js';
import type {
  Choice,
  ChoiceGroup,
  SelectionPanelModel,
} from '../../views/parts/selection-panel.js';
import type { ThumbCard } from '../../views/parts/thumb-grid.js';

const SECTIONS: readonly Section[] = ['photos', 'video', 'library'];

/** What a list's selection mode adds to its page. */
export type SelectionParts = {
  readonly cards: readonly ThumbCard[];
  /** The toolbar's "Select items to tag", while the list isn't in selection mode. */
  readonly selectHref: string | undefined;
  readonly panel: SelectionPanelModel | undefined;
};

/** A section's subcategories as choices, in their order. */
function subcategoryChoices(db: Db, section: Section): Choice[] {
  return findSubcategoriesBySection(db, section).map((subcategory) => ({
    value: String(subcategory.id),
    label: subcategory.name,
  }));
}

/**
 * Where a selection can be filed: the list's own section's subcategories, then Unsorted. A list
 * across sections offers every section's, under its name; the server refuses a subcategory of
 * another section than an item's.
 */
function filingChoices(db: Db, section: Section | undefined): ChoiceGroup[] {
  const unsorted = { value: 'unsorted', label: 'Unsorted' };
  if (section !== undefined) {
    return [{ choices: [...subcategoryChoices(db, section), unsorted] }];
  }
  const bySection = SECTIONS.map((inSection) => ({
    heading: SECTION_LABELS[inSection],
    choices: subcategoryChoices(db, inSection),
  }));
  return [...bySection.filter((group) => group.choices.length > 0), { choices: [unsorted] }];
}

/** The action panel's model: what the list is, and the collections, models and subcategories. */
function panelFor(db: Db, list: { spec: ListSpec; view: ListView; total: number }) {
  const { spec, view, total } = list;
  const panel: SelectionPanelModel = {
    doneHref: listHref(spec.address, view, { isSelecting: false }),
    query: queryToText(spec.query),
    total,
    allLabel: spec.isSearch
      ? `all ${formatCount(total)} results`
      : `all ${formatCount(total)} in ${spec.title}`,
    models: findModelNames(db).map((model) => ({ value: String(model.id), label: model.name })),
    collections: findCollectionSummaries(db).map((collection) => ({
      value: String(collection.id),
      label: collection.name,
    })),
    currentCollection: spec.collection && {
      value: String(spec.collection.id),
      label: spec.collection.name,
    },
    subcategories: filingChoices(db, spec.section),
  };
  return panel;
}

/**
 * Adds selection mode to a page of a list: the link into it, or, once in it, the panel and each
 * card's tags. An empty list has nothing to select.
 */
export function selectionParts(
  db: Db,
  list: { spec: ListSpec; view: ListView; total: number; cards: readonly ThumbCard[] },
): SelectionParts {
  const { spec, view, total, cards } = list;
  if (total === 0) {
    return { cards, selectHref: undefined, panel: undefined };
  }
  if (!view.isSelecting) {
    return {
      cards,
      selectHref: listHref(spec.address, view, { isSelecting: true }),
      panel: undefined,
    };
  }
  const tags = findTagNamesByItems(
    db,
    cards.flatMap((card) => (card.itemId === undefined ? [] : [card.itemId])),
  );
  return {
    cards: cards.map((card) => ({
      ...card,
      tags: card.itemId === undefined ? [] : (tags.get(card.itemId) ?? []),
    })),
    selectHref: undefined,
    panel: panelFor(db, list),
  };
}
