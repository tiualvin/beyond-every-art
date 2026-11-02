// Applies proposed alt text to existing media records.
//
//   pnpm repair:media-alt --input media-alts-final.csv --dry-run
//   pnpm repair:media-alt --input media-alts-final.csv
//
// Flags:
//   --input <path>   CSV with a `media_id` (or `id`) column and an `alt` column
//   --dry-run        report only; no database writes
//   --limit <n>      stop after n updates (default: all)
//   --report <path>  report output path (default media-alt-report.json)
//
// The 109 migrated media records that carry Ghost's fallback for a missing alt
// attribute — the upload's file name — render `alt=""`, because `toAltText`
// blanks a file name rather than let a screen reader announce one. This writes
// real descriptions over them. Planning, including why a proposal the site
// would discard is refused instead of written, is in `lib/media/alt-text.ts`.
//
// **This cannot change an image, and that is enforced rather than intended.**
// The update payload is built here as `{ alt }` and nothing else, so no other
// field is part of the write; `updateMediaAlt` below is the only call site and
// takes only the text to set. After each write the record is read back and the
// fields that decide which file a page loads — `url`, `filename`, `filesize` —
// are compared against what they were. A difference is reported as a failure
// against that id and the run stops, because the one outcome worth halting for
// is a page whose image changed when the job was supposed to change a caption.
//
// Deliberately not `backfill:media`, which re-hands originals to Payload and is
// the only script here that writes image files. Nothing in this path touches a
// file, and no media record is created or deleted.

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { getPayloadClient } from '../lib/payload'
import {
  LONG_ALT,
  parseAltCsv,
  planAltRepair,
  type MediaDoc,
} from '../lib/media/alt-text'

/** The fields compared before and after, to prove the file did not move. */
const FROZEN = ['url', 'filename', 'filesize', 'mimeType'] as const

interface Cli {
  input?: string
  dryRun: boolean
  limit?: number
  reportPath: string
}

function parseArgs(argv: string[]): Cli {
  const value = (flag: string): string | undefined => {
    const at = argv.indexOf(flag)
    return at === -1 ? undefined : argv[at + 1]
  }
  return {
    input: value('--input'),
    dryRun: argv.includes('--dry-run'),
    limit: value('--limit') ? Number(value('--limit')) : undefined,
    reportPath: value('--report') ?? 'media-alt-report.json',
  }
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2))

  if (!cli.input) {
    console.error('--input <path> is required: a CSV of media_id,alt')
    process.exitCode = 1
    return
  }

  const { rows, rejected } = parseAltCsv(await readFile(cli.input, 'utf8'))
  if (rows.length === 0) {
    console.error(`No usable rows in ${cli.input}.`)
    for (const r of rejected) console.error(`  line ${r.line}: ${r.reason}`)
    process.exitCode = 1
    return
  }

  const payload = await getPayloadClient()

  // One read for every proposal, so the plan can tell "already this" from
  // "would change" without a request per row.
  const found = await payload.find({
    collection: 'media',
    overrideAccess: true,
    depth: 0,
    pagination: false,
    limit: 0,
    where: { id: { in: rows.map((r) => r.id) } },
    select: {
      alt: true,
      filename: true,
      url: true,
      filesize: true,
      mimeType: true,
    },
  })

  const docs = found.docs as unknown as MediaDoc[]
  const plan = planAltRepair(docs, rows)

  const about = (id: number | string): Record<string, unknown> => {
    const doc = docs.find((d) => String(d.id) === String(id)) as
      Record<string, unknown> | undefined
    if (!doc) return {}
    return Object.fromEntries(FROZEN.map((key) => [key, doc[key]]))
  }

  console.log(`read      ${rows.length} proposals from ${cli.input}`)
  console.log(`refused   ${plan.refused.length}`)
  console.log(`unknown   ${plan.unknown.length}`)
  console.log(`unchanged ${plan.unchanged.length}`)
  console.log(`to write  ${plan.updates.length}`)
  if (plan.unaddressed.length > 0) {
    console.log(
      `untouched ${plan.unaddressed.length} media records had no proposal`,
    )
  }
  for (const r of rejected) console.log(`  skipped line ${r.line}: ${r.reason}`)
  for (const r of plan.refused) {
    console.log(`  refused media ${r.id}: ${r.reason}`)
  }
  for (const id of plan.unknown) console.log(`  unknown media ${id}`)

  const long = plan.updates.filter((u) => u.after.length > LONG_ALT)
  if (long.length > 0) {
    console.log(
      `\n${long.length} descriptions are longer than ${LONG_ALT} characters:`,
    )
    for (const u of long)
      console.log(`  media ${u.id}: ${u.after.length} characters`)
  }

  const targets = cli.limit ? plan.updates.slice(0, cli.limit) : plan.updates

  if (cli.dryRun) {
    console.log('\n--- dry run: nothing written ---')
    for (const u of targets) {
      console.log(`\nmedia ${u.id}  ${u.filename}`)
      console.log(`  before: ${u.before || '(empty)'}`)
      console.log(`  after:  ${u.after}`)
    }
  } else {
    let written = 0
    const failures: { id: number | string; reason: string }[] = []

    for (const u of targets) {
      const before = about(u.id)

      await payload.update({
        collection: 'media',
        id: u.id,
        overrideAccess: true,
        // The whole payload. Every other field is absent from the update
        // rather than sent unchanged, so a bug elsewhere cannot smuggle one in.
        data: { alt: u.after },
      })

      const after = (await payload.findByID({
        collection: 'media',
        id: u.id,
        overrideAccess: true,
        depth: 0,
        select: {
          alt: true,
          filename: true,
          url: true,
          filesize: true,
          mimeType: true,
        },
      })) as unknown as Record<string, unknown>

      const moved = FROZEN.filter((key) => before[key] !== after[key])
      if (moved.length > 0) {
        failures.push({ id: u.id, reason: `changed ${moved.join(', ')}` })
        break
      }
      if (after.alt !== u.after) {
        failures.push({ id: u.id, reason: 'the saved alt is not the alt sent' })
        break
      }

      written++
      console.log(`  media ${u.id}  wrote ${u.after.length} chars`)
    }

    console.log(`\nwrote ${written} of ${targets.length}`)
    if (failures.length > 0) {
      console.error('\nSTOPPED: a write did not do only what it was asked to.')
      for (const f of failures) console.error(`  media ${f.id}: ${f.reason}`)
      console.error(
        '  Nothing further was written. Investigate before rerunning.',
      )
      process.exitCode = 1
    }
  }

  await writeFile(
    resolve(cli.reportPath),
    `${JSON.stringify(
      {
        mode: cli.dryRun ? 'dry-run' : 'apply',
        input: cli.input,
        read: rows.length,
        rejected,
        refused: plan.refused,
        unknown: plan.unknown,
        unchanged: plan.unchanged.length,
        written: cli.dryRun ? 0 : targets.length,
        planned: plan.updates,
        unaddressed: plan.unaddressed.length,
      },
      null,
      2,
    )}\n`,
  )
  console.log(`report: ${cli.reportPath}`)
}

main()
  .then(() => {
    // Payload holds an open Postgres pool, so the event loop never drains on
    // its own — the same reason `repair-migrated-content.ts` exits explicitly.
    process.exit(typeof process.exitCode === 'number' ? process.exitCode : 0)
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
