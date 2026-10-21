// Processes a publication's source PDF into page images and page records.
//
//   pnpm publications:process --publication <slug|id> --source-key publication-sources/<file>.pdf
//   pnpm publications:process --publication <slug|id> --source-file ./issue.pdf
//   pnpm publications:process --publication sample-issue --sample 8 --create
//
// Options:
//   --pages 3,5-7   redraw these pages whatever their state
//   --all           redraw every page
//   --dry-run       fetch and validate the file, count what would be drawn,
//                   and write nothing
//
// On the server it runs in its own container, with a memory limit of its own
// (docker-compose.yml, service `publications`):
//
//   docker compose run --rm publications --publication <slug> --source-key <key>
//
// The owner copies the PDF into the media bucket under `publication-sources/`
// first — from the Cloudflare dashboard or with rclone — and keeps the
// original (docs/BACKUP_AND_RESTORE.md). Processing starts from this command
// and nothing else: never from a save, because a Publication autosaves every
// 800 ms (docs/PUBLICATION_SYSTEM.md, "PDF processing").
//
// Safe to rerun. A page already drawn from the same file is skipped, so a run
// that stopped part way resumes; a run left marked as processing by a killed
// container is failed after 15 minutes without progress. Prints a JSON report
// and exits 1 when the run did not end ready.

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { S3Config } from '../lib/backup/s3'
import { LIMITS, parsePageSelection } from '../lib/publications/processing/plan'
import type { Source } from '../lib/publications/processing/run'

export type Cli = {
  publication: string
  source:
    | { kind: 'r2'; key: string }
    | { kind: 'file'; path: string }
    | { kind: 'sample'; pages: number }
  create: boolean
  force?: number[] | 'all'
  dryRun: boolean
  /** Refuse to run without R2 (the `publications` service always passes it). */
  requireR2: boolean
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UsageError'
  }
}

const VALUED = new Set([
  '--publication',
  '--source-key',
  '--source-file',
  '--pages',
])
const FLAGS = new Set([
  '--create',
  '--all',
  '--dry-run',
  '--sample',
  '--require-r2',
])

export function parseArgs(argv: string[]): Cli {
  const values = new Map<string, string>()
  const flags = new Set<string>()
  let samplePages: number | undefined
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (VALUED.has(arg)) {
      const value = argv[++i]
      if (value === undefined || value.startsWith('--'))
        throw new UsageError(`${arg} needs a value.`)
      values.set(arg, value)
    } else if (FLAGS.has(arg)) {
      flags.add(arg)
      // `--sample` takes an optional page count.
      if (arg === '--sample' && argv[i + 1] && /^\d+$/.test(argv[i + 1]!)) {
        samplePages = Number(argv[++i])
      }
    } else {
      throw new UsageError(`Unknown argument: ${arg}`)
    }
  }

  const publication = values.get('--publication')
  if (!publication) throw new UsageError('--publication <slug|id> is required.')

  const sources = [
    values.has('--source-key'),
    values.has('--source-file'),
    flags.has('--sample'),
  ].filter(Boolean).length
  if (sources !== 1) {
    throw new UsageError(
      'Give exactly one of --source-key, --source-file or --sample.',
    )
  }
  let source: Cli['source']
  if (values.has('--source-key'))
    source = { kind: 'r2', key: values.get('--source-key')! }
  else if (values.has('--source-file'))
    source = { kind: 'file', path: values.get('--source-file')! }
  else {
    const pages = samplePages ?? 8
    if (pages < 1 || pages > LIMITS.maxPages) {
      throw new UsageError(
        `--sample takes a page count from 1 to ${LIMITS.maxPages}.`,
      )
    }
    source = { kind: 'sample', pages }
  }

  // Creating a publication is for the sample alone: a real issue is created
  // in the admin, where an editor gives it a title and decides its slug.
  if (flags.has('--create') && source.kind !== 'sample') {
    throw new UsageError('--create only goes with --sample.')
  }
  if (flags.has('--all') && values.has('--pages')) {
    throw new UsageError('Give --all or --pages, not both.')
  }
  let force: Cli['force']
  if (flags.has('--all')) force = 'all'
  else if (values.has('--pages')) {
    try {
      force = parsePageSelection(values.get('--pages')!)
    } catch (error) {
      throw new UsageError(`--pages: ${(error as Error).message}`)
    }
  }

  return {
    publication,
    source,
    create: flags.has('--create'),
    force,
    dryRun: flags.has('--dry-run'),
    requireR2: flags.has('--require-r2'),
  }
}

/** The media bucket's credentials, which a source key is read with. */
export function sourceStorage(
  env: Record<string, string | undefined>,
): S3Config {
  const missing = [
    'S3_ENDPOINT',
    'S3_BUCKET',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
  ].filter((name) => !env[name])
  if (missing.length) {
    throw new UsageError(
      `--source-key reads from R2 and needs ${missing.join(', ')}.`,
    )
  }
  return {
    endpoint: env.S3_ENDPOINT!,
    region: env.S3_REGION || 'auto',
    bucket: env.S3_BUCKET!,
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
  }
}

/**
 * Whether page images will reach R2. Without it Payload writes them to
 * `publication-pages/` in the working directory, which in a container that is
 * removed when the run ends means records pointing at files that are gone.
 */
export function assertStorage(env: Record<string, string | undefined>): void {
  if (!env.S3_BUCKET || !env.S3_ENDPOINT) {
    throw new UsageError(
      'R2 is not configured (S3_BUCKET, S3_ENDPOINT), so page images would be ' +
        'written inside this container and lost when it is removed. Set the ' +
        'S3_* variables, or run the command from a checkout instead.',
    )
  }
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2))
  if (cli.requireR2) assertStorage(process.env)
  const source: Source =
    cli.source.kind === 'r2'
      ? { ...cli.source, s3: sourceStorage(process.env) }
      : cli.source

  // libvips keeps a cache and a thread per core by default. In a container
  // with a memory limit of its own, one page at a time and no cache is what
  // keeps a large page from taking the run past it.
  const { default: sharp } = await import('sharp')
  sharp.concurrency(1)
  sharp.cache(false)

  const [{ getPayload }, { default: config }, run, store] = await Promise.all([
    import('payload'),
    import('@payload-config'),
    import('../lib/publications/processing/run'),
    import('../lib/publications/processing/store'),
  ])
  const payload = await getPayload({ config })

  let publication = await store.findPublication(payload, cli.publication)
  if (!publication && cli.create) {
    publication = await store.createSampleDraft(payload, cli.publication)
    console.error(
      `Created draft publication ${publication.slug} for the sample.`,
    )
  }
  if (!publication) {
    throw new UsageError(
      `No publication ${cli.publication}. Create it in the admin first` +
        (cli.source.kind === 'sample'
          ? ', or add --create for the sample.'
          : '.'),
    )
  }

  const report = await run.processPublication(payload, {
    publication,
    source,
    force: cli.force,
    dryRun: cli.dryRun,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    log: (line) => console.error(line),
  })
  console.log(JSON.stringify(report, null, 2))
  if (report.error) process.exitCode = 1
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main()
    .then(() => {
      // Payload holds an open Postgres pool, so the event loop never drains on
      // its own — the same reason the other Payload scripts exit explicitly.
      process.exit(typeof process.exitCode === 'number' ? process.exitCode : 0)
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(error instanceof UsageError ? 2 : 1)
    })
}
