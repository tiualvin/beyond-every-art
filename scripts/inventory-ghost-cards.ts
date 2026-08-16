// Inventory Ghost editor cards without writing to the export or database.

import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  inventoryGhostCards,
  type CardInventory,
} from '../lib/migration/card-inventory'

const DEFAULT_EXPORT =
  process.env.GHOST_EXPORT_PATH || './ghost-export/ghost-content.json'

type Args = {
  exportPath: string
  examples: boolean
  failOnUnhandled: boolean
  jsonPath?: string
  help: boolean
}

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    exportPath: DEFAULT_EXPORT,
    examples: false,
    failOnUnhandled: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (
      (argument === '--export' || argument === '--input') &&
      argv[index + 1]
    ) {
      args.exportPath = argv[++index]
    } else if (argument === '--json' && argv[index + 1]) {
      args.jsonPath = argv[++index]
    } else if (argument === '--examples') {
      args.examples = true
    } else if (argument === '--fail-on-unhandled') {
      args.failOnUnhandled = true
    } else if (argument === '--help' || argument === '-h') {
      args.help = true
    } else if (argument === '--') {
      // pnpm may forward its conventional argument separator to the script.
      continue
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`)
    }
  }
  return args
}

function usage(): string {
  return `Usage: pnpm inventory:ghost -- [options]

Options:
  --input, --export <path>  Ghost JSON export (default: GHOST_EXPORT_PATH or ghost-export/ghost-content.json)
  --examples                Print one example slug for each card
  --json <path>             Write a deterministic, owner-readable JSON report
  --fail-on-unhandled       Exit 1 when an unhandled or unknown card is present
  -h, --help                Show this help`
}

function printInventory(
  inventory: CardInventory,
  resolved: string,
  examples: boolean,
): void {
  console.log(`\nGhost card inventory — ${resolved}`)
  console.log(
    `${inventory.documents} documents, ${inventory.documentsWithCards} containing cards\n`,
  )

  if (inventory.cards.length === 0) {
    console.log('No Ghost cards found. Every body is plain prose and images.')
  } else {
    const width = Math.max(...inventory.cards.map(({ card }) => card.length))
    console.log(
      `${'card'.padEnd(width)}  ${'uses'.padStart(5)}  ${'docs'.padStart(4)}  covered by`,
    )
    console.log('-'.repeat(width + 30))
    for (const row of inventory.cards) {
      const coverage =
        row.status === 'covered'
          ? row.coverage
          : row.status === 'unknown'
            ? '— unknown card'
            : '— NOT HANDLED'
      console.log(
        `${row.card.padEnd(width)}  ${String(row.uses).padStart(5)}  ${String(row.documents).padStart(4)}  ${coverage}`,
      )
      if (examples)
        console.log(`${' '.repeat(width)}         e.g. /${row.exampleSlug}`)
    }
  }

  if (inventory.rawHTMLCards > 0) {
    console.log(
      `\n${inventory.rawHTMLCards} raw HTML card(s). These hold hand-written markup and no` +
        '\nblock can replace them — they stay in legacyHTML.',
    )
  }

  const gaps = inventory.cards.filter(({ status }) => status !== 'covered')
  if (gaps.length > 0) {
    console.log('\nWorth a block, in order of use:')
    for (const row of gaps) console.log(`  ${row.card} — ${row.uses} use(s)`)
  } else {
    console.log('\nEvery card found is already handled by a block.')
  }
  console.log('')
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  let args: Args
  try {
    args = parseArgs(argv)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    console.error(usage())
    return 1
  }

  if (args.help) {
    console.log(usage())
    return 0
  }

  const resolved = path.resolve(process.cwd(), args.exportPath)

  // Missing and malformed are reported separately. Running this with no
  // arguments on a fresh clone hits the first case every time — the export is
  // gitignored — and "could not parse" would describe a file that was never
  // opened, without saying where to point it instead.
  let raw: string
  try {
    raw = await readFile(resolved, 'utf8')
  } catch {
    console.error(`Could not read a Ghost export at ${resolved}.`)
    console.error(
      'Point it somewhere else with --input <path>, or set GHOST_EXPORT_PATH.',
    )
    return 1
  }

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch (error) {
    console.error(`Could not parse the Ghost export at ${resolved}.`)
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }

  let inventory: CardInventory
  try {
    inventory = inventoryGhostCards(payload)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }

  printInventory(inventory, resolved, args.examples)

  if (args.jsonPath) {
    const reportPath = path.resolve(process.cwd(), args.jsonPath)
    try {
      await mkdir(path.dirname(reportPath), { recursive: true })
      // The report names slugs from a private export, so it is written
      // owner-only. `mode` applies only when `writeFile` creates the file; on a
      // rerun over an existing report it is ignored, and `chmod` is what
      // actually holds the permission down.
      await writeFile(reportPath, `${JSON.stringify(inventory, null, 2)}\n`, {
        mode: 0o600,
      })
      await chmod(reportPath, 0o600)
    } catch (error) {
      console.error(`Could not write the JSON report to ${reportPath}.`)
      console.error(error instanceof Error ? error.message : String(error))
      return 1
    }
  }

  return args.failOnUnhandled && !inventory.ok ? 1 : 0
}

// Same guard as scripts/compare-sites.ts: `main()` runs only as the entry
// module, so `parseArgs` and `main` stay importable by the unit tests. Settling
// the promise here rather than awaiting it at the top level keeps this file
// free of top-level await — which esbuild refuses to transform for a CJS
// output format — and turns an unexpected rejection into one clean line and a
// non-zero exit instead of an unhandled-rejection stack trace.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().then(
    (code) => {
      process.exitCode = code
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    },
  )
}
