// Refetches media files whose records survived but whose bytes were lost.
//
//   pnpm restore:media --dry-run
//   pnpm restore:media
//
// Flags:
//   --from-dir <path>      read files from an extracted Ghost archive instead
//                          of the network (see below)
//   --dry-run              list what would be refetched; downloads nothing
//   --ghost-base-url <url> origin for __GHOST_URL__ placeholders (or GHOST_SITE_URL)
//   --limit <n>            stop after n documents (default: all)
//   --report <path>        report output path (default media-restore-report.json)
//
// `--from-dir` points at an unpacked Ghost site archive, which carries every
// media file under `content/images/...` exactly as the stored URLs address
// them. Prefer it to the network whenever the archive is available: it cannot
// 404, cannot be rate-limited, and does not depend on the old site still being
// up — which, at the point this script is needed, is not a safe thing to
// depend on.
//
// Every `media` row records the URL it was migrated from. When the stored files
// are gone but the rows are not, that URL is the way back: download it, hand it
// to Payload, and Payload rewrites the file and regenerates every declared size
// under the existing document id and the existing filename. No post loses its
// featured image, and no `<img src>` in a migrated body changes.
//
// `overwriteExistingFiles: true` is what preserves the filename. Without it
// Payload treats the upload as a name collision and stores `photograph-1.jpg`,
// which would leave the row pointing at a name that is still missing.
//
// This is *not* `pnpm migrate:ghost`. That importer matches on `ghostURL` and
// skips any row that already exists, so on a database whose rows survived it
// reports everything reused and uploads nothing at all.
//
// Safe to rerun: it refetches whatever it is pointed at, and re-uploading a
// file that is already correct produces the same file.

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

import { resolveUrl } from '../lib/migration/media-import'
import {
  buildLocalIndex,
  findLocalFile,
  isUsableDownload,
  planRestore,
  type LocalFile,
  type LocalIndex,
  type RestorableDoc,
  type RestorePlan,
} from '../lib/media/restore'

const DOWNLOAD_TIMEOUT_MS = 30_000
const RETRIES = 2

interface Cli {
  dryRun: boolean
  fromDir?: string
  ghostBaseUrl?: string
  limit?: number
  reportPath: string
}

/** Every file under a directory, as paths relative to it. */
async function walk(root: string, dir = root): Promise<LocalFile[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const found: LocalFile[] = []
  for (const entry of entries) {
    const absolutePath = join(dir, entry.name)
    if (entry.isDirectory()) {
      found.push(...(await walk(root, absolutePath)))
    } else if (entry.isFile()) {
      found.push({
        relativePath: `/${relative(root, absolutePath)}`,
        absolutePath,
      })
    }
  }
  return found
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
    fromDir: flagValue(argv, '--from-dir'),
    ghostBaseUrl:
      flagValue(argv, '--ghost-base-url') ?? process.env.GHOST_SITE_URL,
    limit: limit === undefined ? undefined : Number(limit),
    reportPath: flagValue(argv, '--report') ?? 'media-restore-report.json',
  }
}

/**
 * Download one file, retrying briefly.
 *
 * A run walks every image the publication has, so one slow response must not
 * end it — but a 404 will not improve on a second attempt, so only server
 * errors and network failures are retried.
 */
async function download(url: string): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      })
      if (response.ok) return response
      if (response.status < 500) {
        throw new Error(`HTTP ${response.status}`)
      }
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
      if (error instanceof Error && /^HTTP [45]\d\d$/.test(error.message)) {
        throw error
      }
    }
    if (attempt < RETRIES) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('download failed')
}

async function main() {
  const { dryRun, fromDir, ghostBaseUrl, limit, reportPath } = parseArgs(
    process.argv.slice(2),
  )

  let archive: LocalIndex | undefined
  if (fromDir) {
    const root = resolve(fromDir)
    const files = await walk(root)
    archive = buildLocalIndex(files)
    process.stderr.write(`Indexed ${files.length} files under ${root}\n`)
  }

  // Lazily imported through the alias the rest of the project uses, so this
  // file parses without a database — the same shape as `migrate-ghost.ts`.
  const [{ getPayload }, { default: config }] = await Promise.all([
    import('payload'),
    import('@payload-config'),
  ])
  const payload = await getPayload({ config })

  const { docs } = await payload.find({
    collection: 'media',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })

  /** Where one document's bytes will come from, for the report. */
  const sourceLabel = (plan: RestorePlan): string => {
    if (!archive) return resolveUrl(plan.ghostURL, ghostBaseUrl)
    const located = findLocalFile(archive, plan.ghostURL)
    return 'reason' in located ? located.reason : located.path
  }

  const { plans, skipped } = planRestore(docs as RestorableDoc[])
  const selected = limit === undefined ? plans : plans.slice(0, limit)

  const restored: Array<{ id: number | string; filename: string }> = []
  const failed: Array<{
    id: number | string
    filename: string
    reason: string
  }> = []

  if (!dryRun) {
    for (const plan of selected) {
      const source = sourceLabel(plan)
      try {
        let bytes: Buffer
        let contentType: string | null = null

        if (archive) {
          const located = findLocalFile(archive, plan.ghostURL)
          if ('reason' in located) {
            failed.push({
              id: plan.id,
              filename: plan.filename,
              reason: located.reason,
            })
            continue
          }
          bytes = await readFile(located.path)
        } else {
          const response = await download(source)
          bytes = Buffer.from(await response.arrayBuffer())
          contentType = response.headers.get('content-type')
        }

        // A reconfigured source can answer a missing image with a 200 and an
        // HTML error page. Storing that would turn a missing file into a
        // corrupt one, which reads as healthy and is harder to find later.
        // Checked for a local file too: an archive can hold a truncated one.
        const usable = isUsableDownload(contentType, bytes.length)
        if (usable !== true) {
          failed.push({ id: plan.id, filename: plan.filename, reason: usable })
          continue
        }

        await payload.update({
          collection: 'media',
          id: plan.id,
          data: {},
          file: {
            data: bytes,
            name: plan.filename,
            mimetype: contentType || plan.mimeType,
            size: bytes.length,
          },
          // Keeps the existing filename, and therefore every URL already
          // published. See the note at the top of this file.
          overwriteExistingFiles: true,
          overrideAccess: true,
        })
        restored.push({ id: plan.id, filename: plan.filename })
      } catch (error) {
        failed.push({
          id: plan.id,
          filename: plan.filename,
          reason: `${source}: ${error instanceof Error ? error.message : String(error)}`,
        })
      }
    }
  }

  const report = {
    mode: dryRun ? 'dry-run' : 'apply',
    mediaTotal: docs.length,
    restorable: plans.length,
    attempted: dryRun ? 0 : selected.length,
    restored: restored.length,
    failed,
    // Rows with no ghostURL were authored here rather than migrated, so the
    // old site has nothing to give back. Listed so the count is explainable.
    skipped,
    source: archive ? 'archive' : 'network',
    documents: dryRun
      ? selected.map((p: RestorePlan) => ({
          id: p.id,
          filename: p.filename,
          from: sourceLabel(p),
        }))
      : restored,
  }

  await writeFile(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

  if (failed.length > 0) process.exitCode = 1
}

main()
  .then(() => {
    // Payload holds an open Postgres pool, so the event loop never drains on
    // its own. Same trap `migrate-ghost.ts` documents.
    process.exit(typeof process.exitCode === 'number' ? process.exitCode : 0)
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
