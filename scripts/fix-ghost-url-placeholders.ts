// CLI entry point for repairing Ghost `__GHOST_URL__` placeholders left in
// migrated post and page bodies.
//
//   pnpm fix:ghost-links --dry-run     # report only; no database writes
//   pnpm fix:ghost-links               # rewrite and verify
//
// Flags:
//   --dry-run          find and report only; no database writes
//   --report <path>    report output path (default ghost-url-fix-report.json)
//
// Why this exists, and why it is not a bare `UPDATE`:
//
// The rewrite itself is one string replacement (`lib/migration/link-rewrite.ts`
// explains what and why). Doing it in SQL would write `posts` and `pages` and
// leave `_posts_v` / `_pages_v` holding the old body — so the next time an
// editor opened one of these documents and saved, Payload would restore the
// broken links from the latest version. Going through `payload.update` keeps
// the document and its version history in step.
//
// `_status` is passed back explicitly on every write, matching what the
// importer does in `lib/migration/import.ts`. Three of the affected documents
// are drafts, and an update that let `_status` default would publish them.
// That is the one way this script could do real damage, so it is stated rather
// than relied upon.
//
// A real run re-reads every document afterwards and fails if any placeholder
// survives. Reporting "12 replaced" proves the writes were attempted; the
// re-read is what proves they landed.

import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { CollectionSlug, Payload } from 'payload'

import {
  findGhostUrlPlaceholders,
  GHOST_URL_PLACEHOLDER,
  stripGhostUrlPlaceholders,
} from '../lib/migration/link-rewrite'

interface Cli {
  dryRun: boolean
  reportPath: string
}

interface Affected {
  collection: 'posts' | 'pages'
  id: string | number
  slug: string | null
  status: string | null
  placeholders: string[]
  occurrences: number
}

function flagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

function parseArgs(argv: string[]): Cli {
  return {
    dryRun: argv.includes('--dry-run'),
    reportPath: flagValue(argv, '--report') ?? 'ghost-url-fix-report.json',
  }
}

type Doc = {
  id: string | number
  slug?: string | null
  legacyHTML?: string | null
  _status?: string | null
}

/**
 * Every document in a collection whose body still carries the placeholder.
 *
 * `draft: true` reads the latest version, `draft: false` the published row.
 * They are scanned separately rather than as one number because a fix that
 * updated one and not the other is precisely the failure this script exists to
 * avoid, and a single query would hide it.
 */
async function findAffected(
  payload: Payload,
  collection: 'posts' | 'pages',
  draft: boolean,
): Promise<Affected[]> {
  const found = await payload.find({
    collection: collection as CollectionSlug,
    where: { legacyHTML: { contains: GHOST_URL_PLACEHOLDER } },
    depth: 0,
    draft,
    pagination: false,
    overrideAccess: true,
  })
  return (found.docs as unknown as Doc[]).map((doc) => ({
    collection,
    id: doc.id,
    slug: doc.slug ?? null,
    status: doc._status ?? null,
    placeholders: findGhostUrlPlaceholders(doc.legacyHTML),
    occurrences: stripGhostUrlPlaceholders(doc.legacyHTML).replaced,
  }))
}

async function main() {
  const { dryRun, reportPath } = parseArgs(process.argv.slice(2))

  const [{ getPayload }, { default: config }] = await Promise.all([
    import('payload'),
    import('@payload-config'),
  ])
  const payload = await getPayload({ config })

  // Drafts are the point: three of the affected documents are unpublished, and
  // a crawl of the live site would never have found them.
  const scan = async (draft: boolean) => [
    ...(await findAffected(payload, 'posts', draft)),
    ...(await findAffected(payload, 'pages', draft)),
  ]

  const before = await scan(true)

  const report: Record<string, unknown> = {
    mode: dryRun ? 'dry-run' : 'fix',
    documentsAffected: before.length,
    placeholdersFound: before.reduce((sum, doc) => sum + doc.occurrences, 0),
    documents: before,
    errors: [] as string[],
  }
  const errors = report.errors as string[]

  if (!dryRun) {
    let updated = 0
    for (const doc of before) {
      try {
        const current = (await payload.findByID({
          collection: doc.collection as CollectionSlug,
          id: doc.id,
          depth: 0,
          draft: true,
          overrideAccess: true,
        })) as unknown as Doc
        const { html } = stripGhostUrlPlaceholders(current.legacyHTML)
        // Shaped exactly like the importer's write in `lib/migration/import.ts`
        // — `_status` carried in `data`, no `draft` option. That combination is
        // what produced these four drafts in the first place, so it is the one
        // form known to preserve them here.
        await payload.update({
          collection: doc.collection as CollectionSlug,
          id: doc.id,
          data: {
            legacyHTML: html,
            // Never let this default. See the header.
            _status: current._status,
          } as never,
          overrideAccess: true,
        })
        updated++
      } catch (error) {
        errors.push(
          `${doc.collection} ${doc.id} (${doc.slug ?? 'no slug'}): ` +
            (error instanceof Error ? error.message : String(error)),
        )
      }
    }
    report.documentsUpdated = updated

    // The verification, not a formality: re-read rather than trusting the
    // write count above. Both views, so a published row and its latest version
    // cannot disagree unnoticed.
    const afterDraft = await scan(true)
    const afterPublished = await scan(false)
    report.documentsStillAffected = afterDraft.length + afterPublished.length
    report.placeholdersRemaining = [...afterDraft, ...afterPublished].reduce(
      (sum, doc) => sum + doc.occurrences,
      0,
    )
    report.remainingInLatestVersion = afterDraft
    report.remainingInPublished = afterPublished
  }

  await writeFile(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

  if (errors.length > 0 || (report.documentsStillAffected as number) > 0) {
    process.exitCode = 1
  }
}

main()
  .then(() => {
    // Payload holds an open Postgres pool, so the event loop never drains on
    // its own — the same reason `migrate-redirects.ts` exits explicitly.
    process.exit(typeof process.exitCode === 'number' ? process.exitCode : 0)
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
