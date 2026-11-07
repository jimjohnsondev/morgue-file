// Group-by on any Index page (R13): the filter panel's Group by list, a list gathered under one
// heading per value with its groups in order, paging through groups, and Prev and Next on the
// Item page following the grouped order (R19).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addField, setFieldValue } from '#core/fields/fields.js';

import { startOrganizeApp } from '../support/organize-app.js';

import type { OrganizeApp } from '../support/organize-app.js';

let organize: OrganizeApp;

/** The search page for a query, with any view settings after it. */
function searchUrl(query: string, view = ''): string {
  return `/search?${new URLSearchParams({ q: query }).toString()}${view}`;
}

/** The group headings a page shows, in order, with their captions. */
function headingsOf(body: string): string[] {
  return [...body.matchAll(/<h3 class="card-group__heading">(.*?)<\/h3>/g)].map((match) =>
    (match[1] ?? '').replaceAll(/<[^>]+>/g, ''),
  );
}

/** The file names under a page's cards, in order. */
function namesOf(body: string): string[] {
  return [...body.matchAll(/class="thumb-card__label"[^>]*>(figure_\d{4}\.jpg)/g)].map(
    (match) => match[1] ?? '',
  );
}

/** Gives each item the rating. */
function rate(ids: readonly number[], rating: number): void {
  for (const id of ids) {
    setFieldValue(organize.db, { entity: 'item', entityId: id, key: 'rating' }, rating);
  }
}

beforeAll(async () => {
  organize = await startOrganizeApp();
  // figure_0201 to figure_0250 are rated 5, figure_0101 to figure_0110 rated 3, the rest not.
  rate(organize.figureIds.slice(200), 5);
  rate(organize.figureIds.slice(100, 110), 3);
  // A text field whose values differ only in case, and a date field, on the first three photos.
  addField(organize.db, { entity: 'item', label: 'Studio', type: 'text' });
  addField(organize.db, { entity: 'item', label: 'Shot on', type: 'date' });
  const values: [string, string][] = [
    ['North', '2023-05-01'],
    ['north', '2021-02-01'],
    ['North', '2023-01-01'],
  ];
  for (const [index, [studio, shotOn]] of values.entries()) {
    const entityId = organize.figureIds[index]!;
    setFieldValue(organize.db, { entity: 'item', entityId, key: 'studio' }, studio);
    setFieldValue(organize.db, { entity: 'item', entityId, key: 'shot_on' }, shotOn);
  }
});

afterAll(async () => {
  await organize.remove();
});

describe('R13: any Index page can group by a field', () => {
  it('R13: groups a list by rating, highest first, with the unrated last', async () => {
    const body = (await organize.get(searchUrl('in:photos sub:figure group:rating'))).body;
    expect(headingsOf(body)).toEqual([
      'Rating: 5 · 50 items',
      'Rating: 3 · 10 items',
      'No rating · 190 items',
    ]);
    const names = namesOf(body);
    expect(names.slice(0, 2)).toEqual(['figure_0201.jpg', 'figure_0202.jpg']);
    expect(names[50]).toBe('figure_0101.jpg');
    expect(names[60]).toBe('figure_0001.jpg');
    expect(body).toContain('250 results · 250 in Photos · page 1 of 3');
  });

  it('R13: pages on through the groups, counting each whole group in its heading', async () => {
    const body = (
      await organize.get(searchUrl('in:photos sub:figure group:rating', '&per=48&page=2'))
    ).body;
    expect(headingsOf(body)).toEqual([
      'Rating: 5 · 50 items',
      'Rating: 3 · 10 items',
      'No rating · 190 items',
    ]);
    expect(namesOf(body).slice(0, 3)).toEqual([
      'figure_0249.jpg',
      'figure_0250.jpg',
      'figure_0101.jpg',
    ]);
    expect(body).toContain('page 2 of 6');
  });

  it('R13: groups a list that spans several subcategories by subcategory', async () => {
    const body = (await organize.get(searchUrl('group:subcategory'))).body;
    expect(headingsOf(body)).toEqual(['Photos › Figure · 250 items']);
    const lastPage = (await organize.get(searchUrl('group:subcategory', '&page=3'))).body;
    expect(headingsOf(lastPage)).toEqual([
      'Photos › Figure · 250 items',
      'Library › Books · 1 item',
    ]);
  });

  it('R13: shows a list as usual when its group: names nothing it can group by', async () => {
    for (const query of [
      'group:notes',
      'group:nothing',
      'in:photos sub:figure group:subcategory',
    ]) {
      const body = (await organize.get(searchUrl(query))).body;
      expect(headingsOf(body)).toEqual([]);
      expect(namesOf(body)[0]).toBe('figure_0001.jpg');
    }
  });

  it('R13: offers Group by in the filter panel: Subcategory only where a list spans several', async () => {
    const section = (await organize.get('/photos')).body;
    expect(section).toContain('<select id="filter-group" name="group"');
    expect(section).toContain('<option value>No grouping</option>');
    expect(section).toContain('<option value="subcategory">Subcategory</option>');
    expect(section).toContain('<option value="rating">Rating</option>');
    expect(section).not.toContain('<option value="notes">');
    const figure = (await organize.get('/photos/figure')).body;
    expect(figure).not.toContain('<option value="subcategory">');
    const grouped = (await organize.get(searchUrl('in:photos sub:figure group:rating'))).body;
    expect(grouped).toContain('<option value="rating" selected>Rating</option>');
    expect(grouped).toContain('group: rating');
  });

  it('R13: folds the panel’s Group by into the query, and drops it at No grouping', async () => {
    const grouped = await organize.get('/search?base=&in=photos&sub=figure&group=rating');
    expect(grouped.statusCode).toBe(303);
    expect(grouped.headers.location).toBe('/search?q=in%3Aphotos+sub%3Afigure+group%3Arating');
    const page = (await organize.get(searchUrl('in:photos sub:figure group:rating'))).body;
    expect(page).toContain('name="base" value="sub:figure"');
    const ungrouped = await organize.get('/search?base=&in=photos&sub=figure&group=');
    expect(ungrouped.headers.location).toBe('/search?q=in%3Aphotos+sub%3Afigure');
  });

  it('R13: steps Prev and Next through the grouped order on the Item page (R19)', async () => {
    const from = 'in:photos sub:figure group:rating';
    const lastFive = organize.figureIds[249]!;
    const body = (await organize.get(`/item/${String(lastFive)}?${new URLSearchParams({ from })}`))
      .body;
    expect(body).toContain('<b>50</b> of 250 in');
    const nextId = organize.figureIds[100]!;
    const previousId = organize.figureIds[248]!;
    const fromParam = new URLSearchParams({ from }).toString();
    expect(body).toContain(`href="/item/${String(nextId)}?${fromParam}" rel="next"`);
    expect(body).toContain(`href="/item/${String(previousId)}?${fromParam}" rel="prev"`);
  });

  it('R13: groups text by value, keeping values that differ only in case in two unbroken groups', async () => {
    const body = (await organize.get(searchUrl('in:photos sub:figure group:studio'))).body;
    expect(headingsOf(body)).toEqual([
      'Studio: North · 2 items',
      'Studio: north · 1 item',
      'No studio · 247 items',
    ]);
    expect(namesOf(body).slice(0, 3)).toEqual([
      'figure_0001.jpg',
      'figure_0003.jpg',
      'figure_0002.jpg',
    ]);
  });

  it('R13: groups dates by year, newest first', async () => {
    const body = (await organize.get(searchUrl('in:photos sub:figure group:shot_on'))).body;
    expect(headingsOf(body)).toEqual([
      'Shot on: 2023 · 2 items',
      'Shot on: 2021 · 1 item',
      'No shot on · 247 items',
    ]);
  });

  it('R13: keeps group as a search word no field can take', () => {
    expect(() => addField(organize.db, { entity: 'item', label: 'Group', type: 'text' })).toThrow(
      /can't be used as a field name/,
    );
  });
});
