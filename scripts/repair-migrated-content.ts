// CLI entry point for the content repairs the Ghost import did not make.
//
//   pnpm repair:content --dry-run --input ghost-export/ghost-content.json
//   pnpm repair:content           --input ghost-export/ghost-content.json
//
// Flags:
//   --input <path>   Ghost content export; required for the credit backfill
//   --dry-run        report only; no database writes
//   --skip-credits   skip the credit backfill
//   --skip-entities  skip the escaped-quote repair
//   --report <path>  report output path (default content-repair-report.json)
//
// Two independent repairs, run together because they need one migrate image
// and one pass over the same documents.
//
// **Photo credits.** Ghost keeps `feature_image_caption` in `posts_meta`, a
// table `lib/migration/plan.ts` already loads and reads four other fields from.
// The field was simply never in `GhostPostMeta`, so 110 credits — every one of
// them `Photo by <name> / Unsplash` — were passed over. They land in
// `media.credit`, which `FeaturedFigure` already renders. Reasoning in
// `lib/migration/feature-image-credits.ts`.
//
// **Escaped quotes.** One post arrived with every `href` wrapped in
// `\&quot;`, which a browser resolves as a relative path and 404s — seven
// links, all dead. Reasoning in `lib/migration/link-rewrite.ts`.
//
// Neither repair invents content: both recover something the export carried or
// undo damage to something it carried. Anything the export never had — the
// missing `alt` text, which Ghost did not have either — is deliberately out of
// scope, because guessing at it here would put fabricated descriptions behind
// an accessibility field where they are worse than nothing.
//
// `ghost-export/` is in `.dockerignore`, so `--input` needs a bind mount:
//
//   docker compose run --rm --build \
//     -v "$PWD/ghost-export:/app/ghost-export:ro" \
//     migrate pnpm repair:content -- --dry-run --input ghost-export/ghost-content.json
//
// `_status` is passed back explicitly on every document write, for the reason
// `fix-ghost-url-placeholders.ts` spells out: four of these documents are
// drafts and an update that let it default would publish them.

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { CollectionSlug, Payload } from 'payload'

import {
  collectFeatureImageCredits,
  type RecoveredCredit,
} from '../lib/migration/feature-image-credits'
import { parseGhostExport } from '../lib/migration/ghost-export'
import { repairEscapedQuotes } from '../lib/migration/link-rewrite'

interface Cli {
  dryRun: boolean
  input?: string
  skipCredits: boolean
  skipEntities: boolean
  reportPath: string
}

function flagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

function parseArgs(argv: string[]): Cli {
  return {
    dryRun: argv.includes('--dry-run'),
    input: flagValue(argv, '--input'),
    skipCredits: argv.includes('--skip-credits'),
    skipEntities: argv.includes('--skip-entities'),
    reportPath: flagValue(argv, '--report') ?? 'content-repair-report.json',
  }
}

type MediaDoc = { id: string | number; credit?: string | null }
type BodyDoc = {
  id: string | number
  slug?: string | null
  legacyHTML?: string | null
  _status?: string | null
}

const BODY_COLLECTIONS = ['posts', 'pages'] as const

/** Media documents needing a credit they do not already carry. */
async function planCredits(
  payload: Payload,
  credits: RecoveredCredit[],
): Promise<{
  planned: Array<Record<string, unknown>>
  unmatched: RecoveredCredit[]
  alreadySet: number
}> {
  const planned: Array<Record<string, unknown>> = []
  const unmatched: RecoveredCredit[] = []
  let alreadySet = 0

  for (const credit of credits) {
    const found = await payload.find({
      collection: 'media' as CollectionSlug,
      where: { ghostURL: { equals: credit.ghostURL } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const doc = found.docs[0] as unknown as MediaDoc | undefined
    if (!doc) {
      // The export credits an image the media table has no row for. Reported
      // rather than fatal: it means the image never migrated, which is a
      // different problem from the one this script fixes.
      unmatched.push(credit)
      continue
    }
    if ((doc.credit ?? '').trim() === credit.credit) {
      alreadySet++
      continue
    }
    planned.push({
      mediaId: doc.id,
      from: credit.slug,
      credit: credit.credit,
      existingCredit: doc.credit ?? null,
    })
  }

  return { planned, unmatched, alreadySet }
}

/** Posts and pages whose bodies still carry an escaped-quote artefact. */
async function planEntityRepairs(
  payload: Payload,
): Promise<Array<Record<string, unknown>>> {
  const planned: Array<Record<string, unknown>> = []
  for (const collection of BODY_COLLECTIONS) {
    // `draft: true` reads the latest version, so an unpublished document is
    // covered — the same reason the placeholder fix reads it this way.
    const found = await payload.find({
      collection: collection as CollectionSlug,
      depth: 0,
      draft: true,
      pagination: false,
      overrideAccess: true,
    })
    for (const raw of found.docs as unknown as BodyDoc[]) {
      const { replaced } = repairEscapedQuotes(raw.legacyHTML)
      if (replaced > 0) {
        planned.push({
          collection,
          id: raw.id,
          slug: raw.slug ?? null,
          status: raw._status ?? null,
          replacements: replaced,
        })
      }
    }
  }
  return planned
}

async function main() {
  const cli = parseArgs(process.argv.slice(2))

  const [{ getPayload }, { default: config }] = await Promise.all([
    import('payload'),
    import('@payload-config'),
  ])
  const payload = await getPayload({ config })

  const report: Record<string, unknown> = {
    mode: cli.dryRun ? 'dry-run' : 'repair',
    errors: [] as string[],
  }
  const errors = report.errors as string[]

  // ---- credits -----------------------------------------------------------
  if (!cli.skipCredits) {
    if (!cli.input) {
      errors.push(
        'Credit backfill skipped: --input <ghost-content.json> was not given. ' +
          'Pass --skip-credits to acknowledge this deliberately.',
      )
    } else {
      const ghost = parseGhostExport(
        JSON.parse(await readFile(resolve(cli.input), 'utf8')),
      )
      const { credits, conflicts, empty } = collectFeatureImageCredits(ghost)
      const { planned, unmatched, alreadySet } = await planCredits(
        payload,
        credits,
      )

      report.credits = {
        foundInExport: credits.length,
        alreadyCorrect: alreadySet,
        toWrite: planned.length,
        unmatchedImages: unmatched.map((c) => c.ghostURL),
        conflictingImages: conflicts,
        emptyCaptions: empty,
        documents: planned,
      }

      if (!cli.dryRun) {
        let written = 0
        for (const entry of planned) {
          try {
            await payload.update({
              collection: 'media' as CollectionSlug,
              id: entry.mediaId as string | number,
              data: { credit: entry.credit } as never,
              overrideAccess: true,
            })
            written++
          } catch (error) {
            errors.push(
              `media ${entry.mediaId}: ` +
                (error instanceof Error ? error.message : String(error)),
            )
          }
        }
        ;(report.credits as Record<string, unknown>).written = written
      }
    }
  }

  // ---- escaped quotes ----------------------------------------------------
  if (!cli.skipEntities) {
    const planned = await planEntityRepairs(payload)
    report.escapedQuotes = { documents: planned, toRepair: planned.length }

    if (!cli.dryRun) {
      let repaired = 0
      for (const entry of planned) {
        try {
          const current = (await payload.findByID({
            collection: entry.collection as CollectionSlug,
            id: entry.id as string | number,
            depth: 0,
            draft: true,
            overrideAccess: true,
          })) as unknown as BodyDoc
          const { html } = repairEscapedQuotes(current.legacyHTML)
          await payload.update({
            collection: entry.collection as CollectionSlug,
            id: entry.id as string | number,
            data: { legacyHTML: html, _status: current._status } as never,
            overrideAccess: true,
          })
          repaired++
        } catch (error) {
          errors.push(
            `${entry.collection} ${entry.id}: ` +
              (error instanceof Error ? error.message : String(error)),
          )
        }
      }
      ;(report.escapedQuotes as Record<string, unknown>).repaired = repaired

      // Re-read rather than trust the counts above.
      const remaining = await planEntityRepairs(payload)
      ;(report.escapedQuotes as Record<string, unknown>).stillAffected =
        remaining.length
      ;(report.escapedQuotes as Record<string, unknown>).remaining = remaining
    }
  }

  await writeFile(
    resolve(cli.reportPath),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

  const stillAffected =
    (report.escapedQuotes as Record<string, unknown> | undefined)
      ?.stillAffected ?? 0
  if (errors.length > 0 || (stillAffected as number) > 0) {
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
