import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  compareCounts,
  MOVED,
  type Counts,
} from '../../lib/i18n/migration-counts'

const MIGRATIONS = join(__dirname, '../../migrations')
const migration = readdirSync(MIGRATIONS).find((name) =>
  name.endsWith('_add_localization.ts'),
)!
const source = readFileSync(join(MIGRATIONS, migration), 'utf8')
const up = source.slice(0, source.indexOf('export async function down'))

describe('the localization migration', () => {
  it('counts every column it moves', () => {
    const dropped = [
      ...up.matchAll(/ALTER TABLE "([^"]+)" DROP COLUMN "([^"]+)"/g),
    ].map(([, table, column]) => `${table}.${column}`)
    const counted = MOVED.flatMap((moved) =>
      moved.columns.map((column) => `${moved.table}.${column}`),
    )
    expect(dropped.sort()).toEqual(counted.sort())
  })

  it('copies every moved column into its locale table before dropping it', () => {
    for (const moved of MOVED) {
      const insert = up.indexOf(`INSERT INTO "${moved.localesTable}"`)
      expect(insert, moved.localesTable).toBeGreaterThan(-1)
      for (const column of moved.columns) {
        const drop = up.indexOf(
          `ALTER TABLE "${moved.table}" DROP COLUMN "${column}"`,
        )
        expect(drop, `${moved.table}.${column}`).toBeGreaterThan(insert)
      }
    }
  })

  it('seeds the English modifiedAt from updatedAt', () => {
    expect(up).toMatch(
      /"slug", "modified_at", "_locale"[\s\S]*"slug", "updated_at", 'en'/,
    )
  })
})

const reading = (overrides: Partial<Counts> = {}): Counts => ({
  shape: 'before',
  rows: { posts: 3, 'posts_locales(en)': 3 },
  values: { 'posts.title': 3, 'posts.content': 1 },
  bodies: { legacyHTML: 2, richText: 1, empty: 0 },
  ...overrides,
})

describe('compareCounts', () => {
  it('agrees when nothing was lost', () => {
    expect(compareCounts(reading(), reading({ shape: 'after' }))).toEqual([])
  })

  it('reports a lost value, a lost row and a body that changed source', () => {
    const after = reading({
      shape: 'after',
      rows: { posts: 3, 'posts_locales(en)': 2 },
      values: { 'posts.title': 3, 'posts.content': 0 },
      bodies: { legacyHTML: 2, richText: 0, empty: 1 },
    })
    expect(compareCounts(reading(), after).map((d) => d.key)).toEqual([
      'rows:posts_locales(en)',
      'values:posts.content',
      'bodies:richText',
      'bodies:empty',
    ])
  })
})
