// CLI entry point for the Ghost -> Payload redirects migration.
//
//   pnpm migrate:redirects --dry-run --input ghost-export/redirects.json
//   pnpm migrate:redirects           --input ghost-export/redirects.json
//
// Flags:
//   --dry-run          parse + report only; no database writes
//   --input <path>     Ghost redirects.json export
//   --report <path>    report output path (default redirects-report.json)
//
// Ghost's redirects.json is a flat array of { from, to, permanent } rules.
// A dry run parses and plans without touching the database. A real run
// upserts each rule into the Redirects collection, keyed on `source`, so it
// is safe to rerun.

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  buildRedirectPlan,
  parseGhostRedirects,
} from '../lib/migration/redirects'

interface Cli {
  dryRun: boolean
  input: string
  reportPath: string
}

function flagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

function parseArgs(argv: string[]): Cli {
  const dryRun = argv.includes('--dry-run')
  const input = flagValue(argv, '--input')
  if (!input) {
    throw new Error('Provide --input <path>')
  }
  return {
    dryRun,
    input,
    reportPath: flagValue(argv, '--report') ?? 'redirects-report.json',
  }
}

async function main() {
  const { dryRun, input, reportPath } = parseArgs(process.argv.slice(2))

  const rules = parseGhostRedirects(
    JSON.parse(await readFile(resolve(input), 'utf8')),
  )
  const plan = buildRedirectPlan(rules)

  const report: Record<string, unknown> = {
    mode: dryRun ? 'dry-run' : 'import',
    redirectsFound: rules.length,
    redirectsPlanned: plan.length,
    errors: [] as string[],
  }

  if (!dryRun) {
    const [{ getPayload }, { default: config }, { importRedirects }] =
      await Promise.all([
        import('payload'),
        import('@payload-config'),
        import('../lib/migration/redirects-import'),
      ])
    const payload = await getPayload({ config })

    const importResult = await importRedirects(payload, plan)
    report.redirectsImported = importResult.created + importResult.updated
    report.created = importResult.created
    report.updated = importResult.updated
    report.errors = importResult.errors
  }

  await writeFile(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

  if (!dryRun && Array.isArray(report.errors) && report.errors.length > 0) {
    process.exitCode = 1
  }
}

main()
  .then(() => {
    // On a real run Payload holds an open Postgres pool, so the event loop
    // never drains on its own. Exit explicitly with the code set above, or CI
    // (and any cutover runbook step) would hang after the report is written.
    process.exit(typeof process.exitCode === 'number' ? process.exitCode : 0)
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
