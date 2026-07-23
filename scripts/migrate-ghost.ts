// CLI entry point for the Ghost -> Payload content migration.
//
//   pnpm migrate:ghost --dry-run --input ghost-export/ghost-content.json
//   pnpm migrate:ghost           --input ghost-export/ghost-content.json
//
// Flags:
//   --dry-run          parse + plan + report only; no database or media writes
//   --input <path>     Ghost export JSON (or set GHOST_EXPORT_PATH)
//   --report <path>    report output path (default migration-report.json)
//   --skip-media       import content without downloading/uploading media
//   --ghost-base-url   origin for __GHOST_URL__ placeholders (or GHOST_SITE_URL)
//
// A dry run parses the export, builds the full migration plan, and writes a
// report without touching the database. A real run uploads media into Payload
// (routed to R2 when configured), then imports content with featured images
// linked and inline image URLs rewritten. Payload is imported lazily so dry
// runs (and CI) never need a database connection.

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { parseGhostExport } from '../lib/migration/ghost-export'
import { buildMigrationPlan, summarizePlan } from '../lib/migration/plan'

interface Cli {
  dryRun: boolean
  input: string
  reportPath: string
  skipMedia: boolean
  ghostBaseUrl?: string
}

function flagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

function parseArgs(argv: string[]): Cli {
  const dryRun = argv.includes('--dry-run')
  const input = flagValue(argv, '--input') ?? process.env.GHOST_EXPORT_PATH
  if (!input) {
    throw new Error('Provide --input <path> or set GHOST_EXPORT_PATH')
  }
  return {
    dryRun,
    input,
    reportPath: flagValue(argv, '--report') ?? 'migration-report.json',
    skipMedia: argv.includes('--skip-media'),
    ghostBaseUrl:
      flagValue(argv, '--ghost-base-url') ?? process.env.GHOST_SITE_URL,
  }
}

async function main() {
  const { dryRun, input, reportPath, skipMedia, ghostBaseUrl } = parseArgs(
    process.argv.slice(2),
  )

  const ghost = parseGhostExport(
    JSON.parse(await readFile(resolve(input), 'utf8')),
  )
  const plan = buildMigrationPlan(ghost)
  const summary = summarizePlan(plan)

  const report: Record<string, unknown> = {
    mode: dryRun ? 'dry-run' : 'import',
    ...summary,
    warnings: buildWarnings(plan.conflicts),
    errors: [] as string[],
  }

  if (!dryRun) {
    // Lazy import keeps Payload (and its database connection) out of dry runs.
    const [
      { getPayload },
      { default: config },
      { runImport },
      { importMedia },
    ] = await Promise.all([
      import('payload'),
      import('@payload-config'),
      import('../lib/migration/import'),
      import('../lib/migration/media-import'),
    ])
    const payload = await getPayload({ config })

    // Import media first so content can link to and inline the new assets.
    let media
    if (!skipMedia && plan.media.length > 0) {
      const mediaResult = await importMedia(payload, plan.media, {
        ghostBaseUrl,
      })
      media = mediaResult.media
      report.mediaImported = mediaResult.imported
      report.mediaReused = mediaResult.reused
      report.mediaFailed = mediaResult.failed
    }

    const importResult = await runImport(payload, plan, { media })
    report.imported = importResult
    report.errors = [
      ...importResult.errors,
      ...(Array.isArray(report.mediaFailed)
        ? report.mediaFailed.map(
            (failure: { url: string; reason: string }) =>
              `media ${failure.url}: ${failure.reason}`,
          )
        : []),
    ]
  }

  await writeFile(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

  if (!dryRun && Array.isArray(report.errors) && report.errors.length > 0) {
    process.exitCode = 1
  }
}

function buildWarnings(conflicts: {
  duplicateSlugs: string[]
  missingAuthors: string[]
  missingTags: string[]
}): string[] {
  const warnings: string[] = []
  if (conflicts.duplicateSlugs.length > 0) {
    warnings.push(
      `Duplicate slugs must be reconciled before import: ${conflicts.duplicateSlugs.join(', ')}`,
    )
  }
  if (conflicts.missingAuthors.length > 0) {
    warnings.push(
      `Posts reference authors missing from the export: ${conflicts.missingAuthors.join(', ')}`,
    )
  }
  if (conflicts.missingTags.length > 0) {
    warnings.push(
      `Posts reference tags missing from the export: ${conflicts.missingTags.join(', ')}`,
    )
  }
  return warnings
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
