// CLI entry point for the Ghost -> Payload content migration.
//
//   pnpm migrate:ghost --dry-run --input ghost-export/ghost-content.json
//   pnpm migrate:ghost           --input ghost-export/ghost-content.json
//
// A dry run parses the export, builds the full migration plan, and writes a
// report without touching the database. A real run additionally imports the
// content through Payload's Local API. Payload is imported lazily so dry runs
// (and CI) never need a database connection.

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { parseGhostExport } from '../lib/migration/ghost-export'
import { buildMigrationPlan, summarizePlan } from '../lib/migration/plan'

interface Cli {
  dryRun: boolean
  input: string
  reportPath: string
}

function parseArgs(argv: string[]): Cli {
  const dryRun = argv.includes('--dry-run')
  const inputFlag = argv.indexOf('--input')
  const input =
    inputFlag >= 0 ? argv[inputFlag + 1] : process.env.GHOST_EXPORT_PATH
  if (!input) {
    throw new Error('Provide --input <path> or set GHOST_EXPORT_PATH')
  }
  const reportFlag = argv.indexOf('--report')
  const reportPath =
    reportFlag >= 0 ? argv[reportFlag + 1] : 'migration-report.json'
  return { dryRun, input, reportPath }
}

async function main() {
  const { dryRun, input, reportPath } = parseArgs(process.argv.slice(2))

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
    const [{ getPayload }, { default: config }, { runImport }] =
      await Promise.all([
        import('payload'),
        import('@payload-config'),
        import('../lib/migration/import'),
      ])
    const payload = await getPayload({ config })
    const importResult = await runImport(payload, plan)
    report.imported = importResult
    report.errors = importResult.errors
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
