// The search tips page E2 links to: the query language written out, one example per row, then
// the keys of the archive's own fields. Not on the canvas; built from its panels and tables.
import { Breadcrumb } from '../parts/breadcrumb.js';
import { Panel } from '../parts/panel.js';

/** One way of searching: an example query and what it finds. */
type Tip = { readonly example: string; readonly meaning: string };

/** The language's words, phrases and filters, as the search box and every Index URL read them. */
const TIPS: readonly Tip[] = [
  {
    example: 'seated backlit',
    meaning:
      'Items holding every word in their file name, tags, collections, subcategory, notes, ' +
      'other text fields or models. The last word also matches the start of a longer one.',
  },
  { example: '"three quarter"', meaning: 'The words together, in this order.' },
  { example: 'tag:hands', meaning: 'Tagged hands.' },
  { example: 'model:Elena', meaning: 'Linked to a model whose name starts with Elena.' },
  { example: 'collection:"Spring model session"', meaning: 'In that collection.' },
  { example: 'in:photos', meaning: 'In one section: photos, video or library.' },
  { example: 'sub:figure', meaning: 'In one subcategory, by the name its address uses.' },
  { example: 'unsorted', meaning: 'Waiting in Unsorted, with no subcategory.' },
  {
    example: 'type:jpg',
    meaning: 'By file type: an extension, or image, video, pdf, cbz or pagefolder.',
  },
  { example: 'rating:4  rating:3+', meaning: 'Rated 4, or 3 and more.' },
  { example: 'notes:gesture', meaning: 'A field holding the text, by the field’s key (below).' },
  {
    example: 'group:rating  group:subcategory',
    meaning: 'Lists everything found in groups, by a field or by subcategory. Finds no less.',
  },
  { example: '-tag:hands  -gesture', meaning: 'A minus sign leaves out what follows it.' },
];

/** A field's key and name, for the list of fields a search can name. */
export type FieldKey = { readonly key: string; readonly label: string };

/** A two-column table: the query in the query font, then what it means. */
function TipTable(props: {
  readonly rows: readonly Tip[];
  readonly headings: readonly [string, string];
}) {
  return (
    <table class="tips-table">
      <thead>
        <tr>
          <th scope="col">{props.headings[0]}</th>
          <th scope="col">{props.headings[1]}</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr key={row.example}>
            <th scope="row">
              <code>{row.example}</code>
            </th>
            <td>{row.meaning}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The search tips page body; the layout adds the banner, tabs and footer. */
export function SearchTipsTemplate(props: { readonly fields: readonly FieldKey[] }) {
  const fieldRows = props.fields.map((field) => ({
    example: `${field.key}:`,
    meaning: field.label,
  }));
  return (
    <div class="tips-page">
      <Breadcrumb
        crumbs={[
          { label: 'Home', href: '/' },
          { label: 'Search', href: '/search' },
          { label: 'Search tips' },
        ]}
      />
      <h1 class="page__title">Search tips</h1>
      <Panel title="Searching">
        <p class="tips-page__line">
          Every part must match; there is no OR. Put a value with spaces in double quotes. The same
          words work in the search box and in Search within on any Index page.
        </p>
        <TipTable headings={['Type', 'Finds']} rows={TIPS} />
      </Panel>
      {fieldRows.length > 0 && (
        <Panel title="Fields on items">
          <TipTable headings={['Key', 'Field']} rows={fieldRows} />
        </Panel>
      )}
    </div>
  );
}
