// What the localization migration must preserve, as numbers.
//
// The migration moves every reader-facing column out of its table and into a
// `_locales` table as English. "Nothing lost" is then a checkable claim: for
// every moved column, the number of non-empty values before the migration
// equals the number of non-empty English values after it, and every table
// keeps its row count. `scripts/i18n-migration-counts.ts` reads these numbers
// from a database in either shape; `compareCounts` says whether two readings
// agree. Pure, so the comparison is unit tested.

/** A table whose columns moved, the columns, and where they went. */
export type MovedColumns = {
  table: string
  localesTable: string
  columns: readonly string[]
}

/**
 * Every column the migration moved. `tests/i18n/migration-counts.test.ts`
 * checks this list against the migration's own DROP COLUMN statements, so a
 * column moved and not counted fails a test rather than escaping the check.
 */
export const MOVED: readonly MovedColumns[] = [
  {
    table: 'posts',
    localesTable: 'posts_locales',
    columns: [
      'title',
      'excerpt',
      'content',
      'legacy_h_t_m_l',
      'meta_title',
      'meta_description',
      'slug',
    ],
  },
  {
    table: '_posts_v',
    localesTable: '_posts_v_locales',
    columns: [
      'version_title',
      'version_excerpt',
      'version_content',
      'version_legacy_h_t_m_l',
      'version_meta_title',
      'version_meta_description',
      'version_slug',
    ],
  },
  {
    table: 'tags',
    localesTable: 'tags_locales',
    columns: ['name', 'slug', 'description', 'meta_title', 'meta_description'],
  },
  { table: 'authors', localesTable: 'authors_locales', columns: ['bio'] },
  {
    table: 'media',
    localesTable: 'media_locales',
    columns: ['alt', 'caption'],
  },
  {
    table: 'site_settings',
    localesTable: 'site_settings_locales',
    columns: ['description'],
  },
  {
    table: 'header',
    localesTable: 'header_locales',
    columns: ['cta_label', 'cta_url'],
  },
  { table: 'footer', localesTable: 'footer_locales', columns: ['copyright'] },
]

/** Tables whose rows stay where they are and must all still be there. */
export const KEPT_TABLES = [
  'posts',
  '_posts_v',
  'tags',
  'authors',
  'media',
  'pages',
  'redirects',
  'header_links',
  'footer_links',
  'posts_rels',
  'site_settings',
  'header',
  'footer',
] as const

/**
 * One reading. `values` is keyed `table.column` and counts non-empty values —
 * in the table itself before the migration, in its locales table's English
 * rows after. `rows` counts each table's rows.
 */
export type Counts = {
  shape: 'before' | 'after'
  rows: Record<string, number>
  values: Record<string, number>
  /** After only: rows per non-English locale, per locales table. */
  translated?: Record<string, number>
  /** How many posts render from each body, as the site decides it. */
  bodies: { legacyHTML: number; richText: number; empty: number }
}

export type Difference = { key: string; before: number; after: number }

/**
 * Where an `after` reading disagrees with a `before` one. Empty means every
 * table kept its rows and every moved column kept every value.
 */
export function compareCounts(before: Counts, after: Counts): Difference[] {
  const differences: Difference[] = []
  const check = (key: string, a: number | undefined, b: number | undefined) => {
    if ((a ?? 0) !== (b ?? 0)) {
      differences.push({ key, before: a ?? 0, after: b ?? 0 })
    }
  }
  for (const key of Object.keys(before.rows)) {
    check(`rows:${key}`, before.rows[key], after.rows[key])
  }
  for (const key of Object.keys(before.values)) {
    check(`values:${key}`, before.values[key], after.values[key])
  }
  check('bodies:legacyHTML', before.bodies.legacyHTML, after.bodies.legacyHTML)
  check('bodies:richText', before.bodies.richText, after.bodies.richText)
  check('bodies:empty', before.bodies.empty, after.bodies.empty)
  return differences
}
