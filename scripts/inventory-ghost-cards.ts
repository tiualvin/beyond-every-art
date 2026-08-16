// Count the Ghost cards actually used across an export.
//
// `docs/INSERTABLE_CONTENT_MODULES.md` opens its Phase 0 with "inventory Ghost
// cards/custom HTML and count actual module patterns", and then every later
// phase decides what to build. Nobody could run that step, so the block
// priorities in that document are reasoning about a typical Ghost blog rather
// than measurements of this one.
//
// This prints the measurements. It reads only — it never writes to the export,
// the database, or anything else.
//
//   pnpm inventory:ghost
//   pnpm inventory:ghost -- --export ./somewhere/else.json --examples
//
// Cards already covered by a block are marked so, which turns the output into
// a work list rather than a table to interpret.

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  ACCORDION_BLOCK,
  BOOKMARK_BLOCK,
  BUTTON_BLOCK,
  CALLOUT_BLOCK,
  EMBED_BLOCK,
  GALLERY_BLOCK,
  PULL_QUOTE_BLOCK,
} from '../blocks/schema'

const DEFAULT_EXPORT =
  process.env.GHOST_EXPORT_PATH || './ghost-export/ghost-content.json'

/**
 * Ghost card class → the block that already renders it, or null.
 *
 * `kg-image-card` and `kg-code-card` map to `null` but are not gaps: an image
 * is a Lexical upload node and a code block is a Lexical code node, so both are
 * already authorable. They are listed to keep them out of the "unhandled"
 * count they would otherwise inflate.
 */
const COVERAGE: Record<string, string | null> = {
  'kg-bookmark-card': BOOKMARK_BLOCK,
  'kg-callout-card': CALLOUT_BLOCK,
  'kg-toggle-card': ACCORDION_BLOCK,
  'kg-button-card': BUTTON_BLOCK,
  'kg-gallery-card': GALLERY_BLOCK,
  'kg-embed-card': EMBED_BLOCK,
  'kg-blockquote-card': PULL_QUOTE_BLOCK,
  'kg-image-card': 'built-in (upload node)',
  'kg-code-card': 'built-in (code node)',
  'kg-audio-card': null,
  'kg-video-card': null,
  'kg-file-card': null,
  'kg-product-card': null,
  'kg-header-card': null,
  'kg-nft-card': null,
}

type Args = { exportPath: string; examples: boolean }

function parseArgs(argv: string[]): Args {
  const args: Args = { exportPath: DEFAULT_EXPORT, examples: false }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--export' && argv[i + 1]) {
      args.exportPath = argv[i + 1]
      i += 1
    } else if (argv[i] === '--examples') {
      args.examples = true
    }
  }
  return args
}

type Doc = { slug?: string; title?: string; html?: string | null }

/** Every posts/pages row in a Ghost export, whichever shape it arrived in. */
function collectDocs(payload: unknown): Doc[] {
  const root = payload as { db?: Array<{ data?: Record<string, unknown> }> }
  const data = root?.db?.[0]?.data ?? (payload as Record<string, unknown>)
  const docs: Doc[] = []

  for (const key of ['posts', 'pages']) {
    const rows = (data as Record<string, unknown>)?.[key]
    if (Array.isArray(rows)) docs.push(...(rows as Doc[]))
  }

  return docs
}

// Whole class tokens only. `\b` at the end would also match the `kg-callout-
// card` sitting inside Ghost's colour modifier `kg-callout-card-blue`, and
// count one callout twice — the trailing lookahead is what keeps a card's own
// modifier classes from inflating its total.
const CARD_CLASS = /kg-[a-z0-9-]*-card(?![-\w])/g
// Ghost writes raw editor HTML into an `<!--kg-card-begin: html-->` fence.
// It is the one thing in an export that no block can ever replace, so it is
// counted separately rather than as a card.
const HTML_CARD = /<!--kg-card-begin:\s*html-->/g

function countMatches(html: string, pattern: RegExp): string[] {
  return html.match(pattern) ?? []
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const resolved = path.resolve(process.cwd(), args.exportPath)

  let raw: string
  try {
    raw = await readFile(resolved, 'utf8')
  } catch {
    console.error(`Could not read a Ghost export at ${resolved}.`)
    console.error(
      'Point it somewhere else with --export <path>, or set GHOST_EXPORT_PATH.',
    )
    process.exitCode = 1
    return
  }

  const docs = collectDocs(JSON.parse(raw))
  if (docs.length === 0) {
    console.error('That file parsed, but held no posts or pages.')
    process.exitCode = 1
    return
  }

  const totals = new Map<string, number>()
  const docsWith = new Map<string, Set<string>>()
  const examples = new Map<string, string>()
  let rawHtmlCards = 0
  let docsWithCards = 0

  for (const doc of docs) {
    const html = doc.html ?? ''
    if (!html) continue

    const cards = countMatches(html, CARD_CLASS)
    rawHtmlCards += countMatches(html, HTML_CARD).length
    if (cards.length > 0) docsWithCards += 1

    for (const card of cards) {
      totals.set(card, (totals.get(card) ?? 0) + 1)
      const seen = docsWith.get(card) ?? new Set<string>()
      seen.add(doc.slug ?? doc.title ?? '(untitled)')
      docsWith.set(card, seen)
      if (!examples.has(card)) examples.set(card, doc.slug ?? '(untitled)')
    }
  }

  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1])

  console.log(`\nGhost card inventory — ${resolved}`)
  console.log(`${docs.length} documents, ${docsWithCards} containing cards\n`)

  if (rows.length === 0) {
    console.log('No Ghost cards found. Every body is plain prose and images.')
  } else {
    const width = Math.max(...rows.map(([card]) => card.length))
    console.log(
      `${'card'.padEnd(width)}  ${'uses'.padStart(5)}  ${'docs'.padStart(4)}  covered by`,
    )
    console.log('-'.repeat(width + 30))

    for (const [card, count] of rows) {
      const covered =
        card in COVERAGE
          ? (COVERAGE[card] ?? '— NOT HANDLED')
          : '— unknown card'
      const docCount = docsWith.get(card)?.size ?? 0
      console.log(
        `${card.padEnd(width)}  ${String(count).padStart(5)}  ${String(docCount).padStart(4)}  ${covered}`,
      )
      if (args.examples) {
        console.log(`${' '.repeat(width)}         e.g. /${examples.get(card)}`)
      }
    }
  }

  if (rawHtmlCards > 0) {
    console.log(
      `\n${rawHtmlCards} raw HTML card(s). These hold hand-written markup and no` +
        '\nblock can replace them — they stay in legacyHTML.',
    )
  }

  const unhandled = rows.filter(
    ([card]) => card in COVERAGE && COVERAGE[card] === null,
  )
  const unknown = rows.filter(([card]) => !(card in COVERAGE))

  if (unhandled.length > 0 || unknown.length > 0) {
    console.log('\nWorth a block, in order of use:')
    for (const [card, count] of [...unhandled, ...unknown]) {
      console.log(`  ${card} — ${count} use(s)`)
    }
  } else {
    console.log('\nEvery card found is already handled by a block.')
  }

  console.log('')
}

void main()
