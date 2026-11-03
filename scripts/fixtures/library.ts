// The 74 publications: 51 books (PDF, CBZ or page folder) and 23 magazine issues across 3 titles.
import { type FixtureFile, minutesAfter, padNumber } from './fixture-file.ts';

/** The title words frame 2 builds its 51 book titles from. */
const BOOK_KINDS = ['Studies in', 'Notes on', 'A Sketchbook of', 'Drawing'] as const;
const BOOK_SUBJECTS = [
  'The Figure',
  'Drapery',
  'Hands',
  'The Head',
  'Gesture',
  'Light and Form',
  'The Skeleton',
  'Muscles',
  'Foreshortening',
  'Values',
  'Portraits',
  'The Pose',
  'Edges',
] as const;
const BOOK_COUNT = 51;
const BOOK_FORMATS = ['pdf', 'cbz', 'pagefolder'] as const;

/** A magazine title and its issues, oldest first. */
export type MagazineTitle = {
  readonly title: string;
  readonly issues: readonly { readonly label: string; readonly issueDate: string }[];
};

/** Every planned publication. */
export function planLibrary(): FixtureFile[] {
  return [...planBooks(), ...planMagazines()];
}

/** The title of book i, as frame 2 shows it: vol. 2 to 4 after the first 13. */
export function bookTitle(index: number): string {
  const kind = BOOK_KINDS[index % BOOK_KINDS.length] ?? '';
  const subject = BOOK_SUBJECTS[(index * 7) % BOOK_SUBJECTS.length] ?? '';
  const volume = index >= 13 ? `, vol. ${String(1 + Math.floor(index / 13))}` : '';
  return `${kind} ${subject}${volume}`;
}

/** Books get 96 to 355 pages and rotate through PDF, CBZ and page folder. */
function planBooks(): FixtureFile[] {
  const books: FixtureFile[] = [];
  for (let index = 0; index < BOOK_COUNT; index++) {
    const title = bookTitle(index);
    const format = BOOK_FORMATS[index % BOOK_FORMATS.length] ?? 'pdf';
    const fileName = format === 'pagefolder' ? title : `${title}.${format}`;
    books.push({
      relPath: `Books/${fileName}`,
      kind: format,
      mtimeMs: minutesAfter('2021-01-04', index * 7 * 1440),
      title,
      pageCount: 96 + ((index * 37) % 260),
    });
  }
  return books;
}

/** The three magazine titles; Life Drawing Quarterly is the one frames 3 and 8 show. */
export function magazineTitles(): readonly MagazineTitle[] {
  const seasons = [
    ['Spring', '03-01'],
    ['Summer', '06-01'],
    ['Fall', '09-01'],
    ['Winter', '12-01'],
  ] as const;
  const quarterly = [2021, 2022, 2023].flatMap((year) =>
    seasons.map(([season, monthDay]) => ({ season: `${season} ${String(year)}`, monthDay, year })),
  );
  return [
    {
      title: 'Life Drawing Quarterly',
      issues: quarterly.map((issue) => ({
        label: issue.season,
        issueDate: `${String(issue.year)}-${issue.monthDay}`,
      })),
    },
    { title: 'Gouache Monthly', issues: monthlyIssues(2024, 6) },
    { title: 'The Figure Annual', issues: annualIssues(2020, 5) },
  ];
}

/** Issues for the first months of one year. */
function monthlyIssues(year: number, count: number): MagazineTitle['issues'] {
  return Array.from({ length: count }, (_, i) => ({
    label: new Date(Date.UTC(year, i, 1)).toLocaleString('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
    issueDate: `${String(year)}-${padNumber(i + 1, 2)}-01`,
  }));
}

/** One issue a year. */
function annualIssues(firstYear: number, count: number): MagazineTitle['issues'] {
  return Array.from({ length: count }, (_, i) => ({
    label: String(firstYear + i),
    issueDate: `${String(firstYear + i)}-11-01`,
  }));
}

/** The file name of issue number n of a title, as in "Life Drawing Quarterly No. 12.pdf". */
export function issueFileName(title: string, number: number): string {
  return `${title} No. ${String(number)}.pdf`;
}

/** Magazine issues are PDFs, one folder per title; No. 12 of the quarterly has 72 pages. */
function planMagazines(): FixtureFile[] {
  const issues: FixtureFile[] = [];
  for (const magazine of magazineTitles()) {
    for (const [index, issue] of magazine.issues.entries()) {
      const number = index + 1;
      issues.push({
        relPath: `Magazines/${magazine.title}/${issueFileName(magazine.title, number)}`,
        kind: 'pdf',
        mtimeMs: minutesAfter(issue.issueDate, 14 * 1440),
        title: `${magazine.title} No. ${String(number)} · ${issue.label}`,
        pageCount: 60 + ((number * 7) % 24),
      });
    }
  }
  return issues;
}
