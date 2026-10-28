// Gives every published post a `contentUpdatedAt` from its version history.
//
//   pnpm backfill:content-updated-at                  # dry run: report only
//   pnpm backfill:content-updated-at --apply          # write
//
// Flags:
//   --apply            write the values; without it nothing is written
//   --all              recompute posts that already have a value too
//   --report <path>    JSON report path (default content-updated-at-report.json)
//
// The rule is `backfillContentUpdatedAt` in `lib/content/content-updated.ts`,
// where it is unit tested and its limits are written down: the latest
// published version whose visible text differs from the published version
// before it, falling back to `publishedAt`.
//
// **What a write touches.** One column, `posts.content_updated_at`, through a
// single UPDATE per post. Not `payload.update`: that would run the hooks,
// write a version, move `updatedAt` — the very thing this exists to stop
// moving — purge every cached page and announce the URL to IndexNow, for a
// value no reader can see. The live row is what every reader of the date uses
// (`contentModifiedAt`), and the hook reads the live row too, so the version
// rows do not need it.
//
// **Safe to rerun.** Posts that already have a value are skipped unless
// `--all` is given — after this ships, the hook sets the value on every
// publish, and a later backfill must not overwrite a date the hook decided.
//
// Pages already rendered keep their old date until the content cache turns
// over (`CONTENT_TTL_SECONDS` in `lib/cache/content.ts`); nothing is purged.
//
// Confirm with the owner before running `--apply` against production.

import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  backfillContentUpdatedAt,
  type BackfillDecision,
  type PublishedVersion,
} from '../lib/content/content-updated'

type Cli = { apply: boolean; all: boolean; reportPath: string }

function parseArgs(argv: string[]): Cli {
  const index = argv.indexOf('--report')
  return {
    apply: argv.includes('--apply'),
    all: argv.includes('--all'),
    reportPath:
      (index >= 0 ? argv[index + 1] : undefined) ??
      'content-updated-at-report.json',
  }
}

type Row = {
  id: number | string
  slug: string
  publishedAt: string | null
  updatedAt: string | null
  current: string | null
  versions: number
} & BackfillDecision

async function main() {
  const { apply, all, reportPath } = parseArgs(process.argv.slice(2))
  const [{ getPayload }, { default: config }, { sql }] = await Promise.all([
    import('payload'),
    import('@payload-config'),
    import('@payloadcms/db-postgres'),
  ])
  const payload = await getPayload({ config })

  const posts = await payload.find({
    collection: 'posts',
    overrideAccess: true,
    depth: 0,
    pagination: false,
    limit: 0,
    where: { _status: { equals: 'published' } },
    select: {
      slug: true,
      publishedAt: true,
      updatedAt: true,
      contentUpdatedAt: true,
    },
  })

  const rows: Row[] = []
  for (const post of posts.docs as Array<Record<string, unknown>>) {
    const current = (post.contentUpdatedAt as string | null) ?? null
    if (current && !all) continue

    const history = await payload.findVersions({
      collection: 'posts',
      overrideAccess: true,
      depth: 0,
      pagination: false,
      limit: 0,
      sort: 'createdAt',
      where: {
        and: [
          { parent: { equals: post.id } },
          { 'version._status': { equals: 'published' } },
        ],
      },
    })
    const versions: PublishedVersion[] = history.docs.map((doc) => {
      const version = doc.version as unknown as Record<string, unknown>
      return {
        at: doc.createdAt as string,
        title: version.title,
        content: version.content,
        legacyHTML: version.legacyHTML,
      }
    })

    rows.push({
      id: post.id as number | string,
      slug: String(post.slug ?? ''),
      publishedAt: (post.publishedAt as string | null) ?? null,
      updatedAt: (post.updatedAt as string | null) ?? null,
      current,
      versions: versions.length,
      ...backfillContentUpdatedAt({ versions, publishedAt: post.publishedAt }),
    })
  }

  const counts = { changed: 0, unchanged: 0, 'no-history': 0 }
  for (const row of rows) counts[row.reason]++

  console.log(
    `${posts.docs.length} published posts; ${rows.length} to set` +
      (all ? ' (--all)' : ' (posts without a value)') +
      `: ${counts.changed} changed since publication, ${counts.unchanged} unchanged, ${counts['no-history']} with one published version.`,
  )
  for (const row of rows) {
    console.log(
      [
        row.reason.padEnd(10),
        (row.contentUpdatedAt ?? '—').padEnd(24),
        `published ${row.publishedAt ?? '—'}`,
        `updatedAt ${row.updatedAt ?? '—'}`,
        `${row.versions}v`,
        row.slug,
      ].join('  '),
    )
  }

  if (apply) {
    for (const row of rows) {
      if (!row.contentUpdatedAt) continue
      await payload.db.drizzle.execute(
        sql`UPDATE "posts" SET "content_updated_at" = ${row.contentUpdatedAt} WHERE "id" = ${row.id}`,
      )
    }
    console.log(`Wrote ${rows.filter((r) => r.contentUpdatedAt).length} rows.`)
  } else {
    console.log('Dry run: nothing written. Pass --apply to write.')
  }

  const path = resolve(reportPath)
  await writeFile(path, `${JSON.stringify({ apply, all, rows }, null, 2)}\n`)
  console.log(`Report: ${path}`)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
