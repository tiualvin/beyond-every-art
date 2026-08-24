// CLI entry point for the Ghost -> Payload members migration.
//
//   pnpm migrate:members --dry-run --input ghost-export/ghost-members.csv
//   pnpm migrate:members           --input ghost-export/ghost-members.csv
//
// Flags:
//   --dry-run          parse + plan + report only; no database writes
//   --input <path>     Ghost members CSV export
//   --report <path>    report output path (default members-report.json)
//
// Ghost's member CSV is a preservation-only export: the Members collection
// is restricted (admin-only) and is not an authentication mechanism. A dry
// run parses the CSV and reports counts/conflicts without touching the
// database. A real run upserts each member, keyed on `ghostID` (the CSV's
// `id` column when present, otherwise the member's email address), so it is
// safe to rerun.
//
// Read `warnings` before the real run. Email and `ghostID` are unique in the
// Members collection, so rows that collide on either are rejected by the
// database one at a time, part-way through an import, once the CSV is the one
// export that cannot casually be pulled again. The dry run names the colliding
// CSV lines instead, while fixing them is still free.

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  buildMemberPlan,
  parseGhostMembersCsv,
  type MemberConflicts,
} from '../lib/migration/members'

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
    reportPath: flagValue(argv, '--report') ?? 'members-report.json',
  }
}

async function main() {
  const { dryRun, input, reportPath } = parseArgs(process.argv.slice(2))

  const rows = parseGhostMembersCsv(await readFile(resolve(input), 'utf8'))
  const { members, skipped, conflicts } = buildMemberPlan(rows)

  const report: Record<string, unknown> = {
    mode: dryRun ? 'dry-run' : 'import',
    rowsFound: rows.length,
    membersPlanned: members.length,
    skipped,
    conflicts,
    warnings: buildWarnings(conflicts),
    errors: [] as string[],
  }

  if (!dryRun) {
    const [{ getPayload }, { default: config }, { importMembers }] =
      await Promise.all([
        import('payload'),
        import('@payload-config'),
        import('../lib/migration/members-import'),
      ])
    const payload = await getPayload({ config })

    const importResult = await importMembers(payload, members)
    report.membersImported = importResult.created + importResult.updated
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

/**
 * Turn the plan's conflicts into sentences. Only line numbers are named: the
 * fix is made in the CSV at those lines, and the report is printed to stdout,
 * so there is no reason for a member's address to travel with it.
 */
function buildWarnings(conflicts: MemberConflicts): string[] {
  const warnings: string[] = []
  const lines = (groups: Array<{ rows: number[] }>) =>
    groups.map((group) => group.rows.join(' + ')).join('; ')

  if (conflicts.duplicateEmails.length > 0) {
    warnings.push(
      `Rows share an email address and must be reconciled before import; ` +
        `the collection rejects all but the first of each: ${lines(conflicts.duplicateEmails)}`,
    )
  }
  if (conflicts.duplicateGhostIDs.length > 0) {
    warnings.push(
      `Rows share a Ghost id and must be reconciled before import, for the ` +
        `same reason: ${lines(conflicts.duplicateGhostIDs)}`,
    )
  }
  return warnings
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
