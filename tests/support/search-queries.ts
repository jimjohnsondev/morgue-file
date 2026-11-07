// The 20 representative searches R24's perf test times on the 50,000-item library, and whose
// query plans are snapshot-tested (docs/ARCHITECTURE.md, Search). They use the perf library's
// names: subcategories Figure, Portrait, Hands, Drapery, Poses, Timelapses, Books and Magazines,
// tags tag-001 to tag-300, models "Model 1" to "Model 40", files perf_00001 to perf_50000.
export const REPRESENTATIVE_SEARCHES = [
  '',
  'in:photos',
  'in:photos sub:figure',
  'in:library -sub:books',
  'tag:tag-007',
  'tag:tag-010 rating:3+',
  'model:"Model 12"',
  'in:library model:Model',
  'in:photos -tag:tag-001 perf_4',
  'type:pdf',
  'in:photos sub:portrait type:jpg',
  'rating:5',
  'perf',
  'perf_49',
  'figure',
  '"perf 01234"',
  'tag-150',
  'model 12',
  'hands -tag:tag-002',
  'in:video poses rating:4+',
] as const;
