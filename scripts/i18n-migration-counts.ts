// Row and value counts for the localization migration, before or after it.
//
//   pnpm i18n:migration-counts                         print a reading
//   pnpm i18n:migration-counts --out before.json       …and save it
//   pnpm i18n:migration-counts --compare before.json   compare with a saved one
//
// Read-only. Works on a database in either shape: before the migration it
// counts the reader-facing columns where they are; after it, the English rows
// they were copied into. `--compare` exits 1 if any table lost a row or any
// moved column lost a value — run it against a scratch restore of production
// before migrating production itself (docs/LOCALIZATION.md).

import { readFile, writeFile } from 'node:fs/promises'

import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'

import config from '../payload.config'
import { toArticleBody } from '../lib/content/body'
import {
  compareCounts,
  KEPT_TABLES,
  MOVED,
  type Counts,
} from '../lib/i18n/migration-counts'

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`

async function main(): Promise<void> {
  const payload = await getPayload({ config })
  const db = payload.db as unknown as {
    drizzle: {
      execute: (
        query: unknown,
      ) => Promise<{ rows: Array<Record<string, unknown>> }>
    }
  }
  const query = async (text: string) =>
    (await db.drizzle.execute(sql.raw(text))).rows

  const after =
    (
      await query(`SELECT to_regclass('public.posts_locales') IS NOT NULL AS x`)
    )[0]?.x === true

  const counts: Counts = {
    shape: after ? 'after' : 'before',
    rows: {},
    values: {},
    bodies: { legacyHTML: 0, richText: 0, empty: 0 },
  }

  for (const table of KEPT_TABLES) {
    const [row] = await query(`SELECT count(*)::int AS n FROM ${ident(table)}`)
    counts.rows[table] = Number(row?.n ?? 0)
  }

  // Empty strings and SQL nulls both count as "no value", and a JSON column
  // holding JSON null too — what matters is whether text survived.
  const present = (column: string) =>
    `count(*) FILTER (WHERE ${ident(column)} IS NOT NULL AND ${ident(column)}::text NOT IN ('', 'null'))::int`

  for (const moved of MOVED) {
    const select = moved.columns
      .map((column) => `${present(column)} AS ${ident(column)}`)
      .join(', ')
    const [row] = after
      ? await query(
          `SELECT ${select} FROM ${ident(moved.localesTable)} WHERE "_locale" = 'en'`,
        )
      : await query(`SELECT ${select} FROM ${ident(moved.table)}`)
    for (const column of moved.columns) {
      counts.values[`${moved.table}.${column}`] = Number(row?.[column] ?? 0)
    }
    if (after) {
      const [english] = await query(
        `SELECT count(*)::int AS n FROM ${ident(moved.localesTable)} WHERE "_locale" = 'en'`,
      )
      // One English row per parent row: anything else is a row the copy
      // missed or doubled.
      counts.rows[`${moved.localesTable}(en)`] = Number(english?.n ?? 0)
      const others = await query(
        `SELECT "_locale"::text AS locale, count(*)::int AS n FROM ${ident(moved.localesTable)} WHERE "_locale" <> 'en' GROUP BY 1`,
      )
      for (const other of others) {
        counts.translated ??= {}
        counts.translated[`${moved.localesTable}.${String(other.locale)}`] =
          Number(other.n)
      }
    } else {
      counts.rows[`${moved.localesTable}(en)`] = counts.rows[moved.table] ?? 0
    }
  }

  // Which body each post renders from, decided by the site's own rule.
  const bodies = after
    ? await query(
        `SELECT l."content", l."legacy_h_t_m_l" AS legacy
           FROM "posts" p LEFT JOIN "posts_locales" l
             ON l."_parent_id" = p."id" AND l."_locale" = 'en'`,
      )
    : await query(`SELECT "content", "legacy_h_t_m_l" AS legacy FROM "posts"`)
  for (const row of bodies) {
    const kind = toArticleBody(
      { content: row.content, legacyHTML: row.legacy as string | null },
      { preview: true },
    ).kind
    if (kind === 'html') counts.bodies.legacyHTML += 1
    else if (kind === 'empty') counts.bodies.empty += 1
    else counts.bodies.richText += 1
  }

  console.log(JSON.stringify(counts, null, 2))

  const out = flag('--out')
  if (out) await writeFile(out, `${JSON.stringify(counts, null, 2)}\n`)

  const compare = flag('--compare')
  if (compare) {
    const before = JSON.parse(await readFile(compare, 'utf8')) as Counts
    const differences = compareCounts(before, counts)
    if (differences.length === 0) {
      console.log(
        `\nOK: every table kept its rows and every moved column kept its values (${before.shape} → ${counts.shape}).`,
      )
    } else {
      console.error('\nMISMATCH:')
      for (const d of differences) {
        console.error(`  ${d.key}: ${d.before} → ${d.after}`)
      }
      process.exitCode = 1
    }
  }
  process.exit(process.exitCode ?? 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
