// Regenerates image derivatives for media already in the library.
//
//   pnpm backfill:media --dry-run
//   pnpm backfill:media
//
// Flags:
//   --dry-run          report what is missing; no reads of originals, no writes
//   --base-url <url>   origin for root-relative media URLs (or NEXT_PUBLIC_SITE_URL)
//   --limit <n>        stop after n documents (default: all)
//   --report <path>    report output path (default media-backfill-report.json)
//
// Payload generates the sizes declared in `collections/Media.ts` at upload time
// and only then, so a size added later exists for nothing already stored. This
// hands each original back to Payload, which regenerates every declared size
// from it.
//
// **It keeps the filename.** `overwriteExistingFiles: true` is what makes that
// true, and it is the whole reason this is a script and not a one-line loop:
// without it Payload treats the re-upload as a name collision and stores
// `photograph-1.jpg` beside `photograph.jpg`, changing the document's URL and
// breaking every `<img src>` in every migrated article that pointed at it.
//
// Safe to rerun. A document that already has every size is skipped, so a second
// run does nothing, and an interrupted run resumes where it stopped.

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  planBackfill,
  sourceFor,
  type BackfillCandidate,
  type DeclaredSize,
  type MediaDoc,
} from '../lib/media/backfill'

interface Cli {
  dryRun: boolean
  baseUrl?: string
  limit?: number
  reportPath: string
}

function flagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

function parseArgs(argv: string[]): Cli {
  const limit = flagValue(argv, '--limit')
  if (limit !== undefined && !/^\d+$/.test(limit)) {
    throw new Error(`--limit must be a positive whole number, got "${limit}"`)
  }
  return {
    dryRun: argv.includes('--dry-run'),
    baseUrl: flagValue(argv, '--base-url') ?? process.env.NEXT_PUBLIC_SITE_URL,
    limit: limit === undefined ? undefined : Number(limit),
    reportPath: flagValue(argv, '--report') ?? 'media-backfill-report.json',
  }
}

/** The bytes of one original, from disk or over the network. */
async function readOriginal(
  source: { kind: 'file'; path: string } | { kind: 'url'; url: string },
): Promise<Buffer> {
  if (source.kind === 'file') return readFile(source.path)

  const response = await fetch(source.url, {
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${source.url}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

async function main() {
  const { dryRun, baseUrl, limit, reportPath } = parseArgs(
    process.argv.slice(2),
  )

  // Imported lazily, and through the `@payload-config` alias the rest of the
  // project uses — the same shape as `migrate-ghost.ts`, so this file parses
  // without a database and resolves the one config every other entry point does.
  const [{ getPayload }, { default: config }] = await Promise.all([
    import('payload'),
    import('@payload-config'),
  ])
  const payload = await getPayload({ config })

  const media = payload.collections.media.config
  const declared: DeclaredSize[] = (
    (media.upload && media.upload.imageSizes) ||
    []
  )
    .filter((size): size is typeof size & { name: string } =>
      Boolean(size.name),
    )
    .map((size) => ({
      name: size.name,
      width: size.width ?? null,
      height: size.height ?? null,
      withoutEnlargement: size.withoutEnlargement ?? undefined,
    }))
  const declaredNames = declared.map((size) => size.name)

  // Payload resolves `staticDir` itself; an S3-backed collection has no local
  // originals, so this is absent there and the URL path is used instead.
  const staticDir =
    media.upload && !media.upload.disableLocalStorage
      ? media.upload.staticDir
      : undefined

  const { docs } = await payload.find({
    collection: 'media',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })

  const candidates = planBackfill(docs as MediaDoc[], declared)
  const selected = limit === undefined ? candidates : candidates.slice(0, limit)

  const regenerated: BackfillCandidate[] = []
  const failed: Array<{ id: number | string; reason: string }> = []

  if (!dryRun) {
    const byId = new Map(
      (docs as MediaDoc[]).map((doc) => [String(doc.id), doc]),
    )

    for (const candidate of selected) {
      const doc = byId.get(String(candidate.id))!
      const source = sourceFor(doc, { staticDir, baseUrl })
      if (source.kind === 'unavailable') {
        failed.push({ id: candidate.id, reason: source.reason })
        continue
      }

      try {
        const data = await readOriginal(source)
        await payload.update({
          collection: 'media',
          id: candidate.id,
          data: {},
          file: {
            data,
            name: candidate.filename,
            mimetype: String(
              (doc as { mimeType?: unknown }).mimeType ??
                'application/octet-stream',
            ),
            size: data.length,
          },
          // Keeps the stored filename, and therefore every URL already
          // published. See the note at the top of this file.
          overwriteExistingFiles: true,
          overrideAccess: true,
        })
        regenerated.push(candidate)
      } catch (error) {
        failed.push({
          id: candidate.id,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  const report = {
    mode: dryRun ? 'dry-run' : 'apply',
    declaredSizes: declaredNames,
    mediaTotal: docs.length,
    // Sizes Payload would omit for an image this small are not counted as
    // missing; see `expectsSize`. So a candidate here is a derivative that
    // should exist and does not.
    candidates: selected.length,
    candidatesTotal: candidates.length,
    regenerated: regenerated.length,
    failed,
    missingBySize: Object.fromEntries(
      declaredNames.map((name) => [
        name,
        candidates.filter((c) => c.missing.includes(name)).length,
      ]),
    ),
    documents: selected,
  }

  await writeFile(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

  if (failed.length > 0) process.exitCode = 1
}

main()
  .then(() => {
    // Payload holds an open Postgres pool, so the event loop never drains on
    // its own and the process would sit there having already printed its
    // report. The same trap `migrate-ghost.ts` documents; exit with the code
    // set above.
    process.exit(typeof process.exitCode === 'number' ? process.exitCode : 0)
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
