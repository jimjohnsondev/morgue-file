// The 280 px filter panel beside an Index grid (frames 1 and 4). It is a plain GET form to
// /search, which folds the choices into one query, so it works with JavaScript off.

/** A tick box or radio button: what it sends, what it says, and whether it starts chosen. */
export type FilterChoice = {
  readonly value: string;
  readonly label: string;
  /** How many items it would show, where the panel counts them. */
  readonly count?: number | undefined;
  readonly isChosen: boolean;
};

/** Everything the panel lists. Groups a page doesn't offer are left undefined. */
export type FilterPanelModel = {
  /** The page's query without the terms the panel sets, sent along so they are kept. */
  readonly baseQuery: string;
  /** The section to keep when the panel has no section boxes (a subcategory page). */
  readonly fixedSection: string | undefined;
  readonly resetHref: string;
  readonly hideHref: string;
  readonly searchLabel: string;
  readonly subcategories: readonly FilterChoice[] | undefined;
  readonly sections: readonly FilterChoice[] | undefined;
  readonly tags: readonly FilterChoice[];
  readonly models: readonly FilterChoice[];
  readonly ratings: readonly FilterChoice[];
  readonly types: readonly FilterChoice[] | undefined;
  readonly collections: readonly FilterChoice[];
};

/** A count in brackets after a choice's name, where the panel has one. */
function countText(choice: FilterChoice): string {
  return choice.count === undefined ? '' : ` (${choice.count.toLocaleString('en-US')})`;
}

/** A titled group of tick boxes or radio buttons. */
function ChoiceGroup(props: {
  readonly legend: string;
  readonly name: string;
  readonly inputType: 'checkbox' | 'radio';
  readonly choices: readonly FilterChoice[];
  readonly isInline?: boolean;
}) {
  return (
    <fieldset class={props.isInline ? 'filter-group filter-group--inline' : 'filter-group'}>
      <legend class="filter-group__title">{props.legend}</legend>
      {props.choices.map((choice) => (
        <label key={choice.value}>
          <input
            type={props.inputType}
            name={props.name}
            value={choice.value}
            checked={choice.isChosen}
          />{' '}
          {choice.isChosen && props.inputType === 'radio' ? <b>{choice.label}</b> : choice.label}
          {countText(choice)}
        </label>
      ))}
    </fieldset>
  );
}

/** A titled drop-down list with an "any" first entry. */
function ChoiceList(props: {
  readonly id: string;
  readonly label: string;
  readonly name: string;
  readonly anyLabel: string;
  readonly choices: readonly FilterChoice[];
}) {
  return (
    <div>
      <label for={props.id} class="filter-group__title">
        {props.label}
      </label>
      <select id={props.id} name={props.name} class="field filter-panel__select">
        <option value="">{props.anyLabel}</option>
        {props.choices.map((choice) => (
          <option key={choice.value} value={choice.value} selected={choice.isChosen}>
            {choice.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The panel: search within, then each filter group, then Apply and Reset. */
export function FilterPanel(props: { readonly model: FilterPanelModel }) {
  const { model } = props;
  return (
    <aside aria-label="Filters" class="panel filter-panel">
      <h2 class="panel__title panel__title--split">
        <span>Filter</span>
        <a href={model.hideHref}>« hide</a>
      </h2>
      <form action="/search" method="get" class="panel__body filter-panel__body">
        <input type="hidden" name="base" value={model.baseQuery} />
        {model.fixedSection !== undefined && (
          <input type="hidden" name="in" value={model.fixedSection} />
        )}
        <div>
          <label for="filter-words" class="filter-group__title">
            {model.searchLabel}
          </label>
          <input id="filter-words" name="words" class="field filter-panel__words" />
        </div>
        {model.sections && (
          <ChoiceGroup legend="Section" name="in" inputType="checkbox" choices={model.sections} />
        )}
        {model.subcategories && (
          <ChoiceGroup
            legend="Subcategory"
            name="sub"
            inputType="radio"
            choices={model.subcategories}
          />
        )}
        {model.tags.length > 0 && (
          <ChoiceGroup legend="Tags" name="tag" inputType="checkbox" choices={model.tags} />
        )}
        {model.models.length > 0 && (
          <ChoiceList
            id="filter-model"
            label="Model"
            name="model"
            anyLabel="Any model"
            choices={model.models}
          />
        )}
        <ChoiceList
          id="filter-rating"
          label="Rating"
          name="rating"
          anyLabel="Any rating"
          choices={model.ratings}
        />
        {model.types && (
          <ChoiceGroup
            legend="Type"
            name="type"
            inputType="checkbox"
            choices={model.types}
            isInline
          />
        )}
        {model.collections.length > 0 && (
          <ChoiceList
            id="filter-collection"
            label="Collection"
            name="collection"
            anyLabel="Any collection"
            choices={model.collections}
          />
        )}
        <div class="filter-panel__actions">
          <button type="submit" class="button">
            Apply
          </button>
          <a href={model.resetHref} class="button">
            Reset
          </a>
        </div>
      </form>
    </aside>
  );
}
