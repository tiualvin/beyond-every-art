// Convert one migrated article from its Ghost HTML into the editor.
//
//   pnpm content:convert-legacy --slug most-expensive-colors-in-history
//   pnpm content:convert-legacy --slug most-expensive-colors-in-history --write
//   pnpm content:convert-legacy --id 51 --json conversion.json
//
// Flags:
//   --slug <slug> | --id <id>  the article; exactly one
//   --dry-run                  report only. The default; accepted so a command
//                              can say so explicitly
//   --write                    save the conversion as a draft, when nothing is
//                              refused and the rich-text body is empty
//   --json <path>              also write the full report as JSON. No default,
//                              so no report lands in the checkout unasked
//
// The same planning and saving as the `convertLegacyArticle` MCP tool —
// `lib/mcp/convert-legacy.ts` — so the two cannot disagree about what a safe
// conversion is. One article per run, by design: nothing here converts in
// bulk. It saves a draft and never publishes; `legacyHTML` is never written,
// so restoring the version it reports as `undo` puts the page back.
//
// It runs as the database, not as a user — whoever can run it on the server
// can already write any post — so it reads and writes with access control
// off, and the guards that matter are the ones above: draft only, empty body
// only, nothing refused.
//
// On the VPS:
//
//   docker compose run --rm migrate pnpm content:convert-legacy --slug <slug>

import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { ConversionReport, LegacyArticle } from '../lib/mcp/convert-legacy'

type Args = {
  slug?: string
  id?: string
  write: boolean
  json?: string
  help: boolean
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { write: false, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--slug' && argv[index + 1]) {
      args.slug = argv[++index]
    } else if (argument === '--id' && argv[index + 1]) {
      args.id = argv[++index]
    } else if (argument === '--write') {
      args.write = true
    } else if (argument === '--dry-run') {
      args.write = false
    } else if (argument === '--json' && argv[index + 1]) {
      args.json = argv[++index]
    } else if (argument === '--help' || argument === '-h') {
      args.help = true
    } else if (argument === '--') {
      // pnpm may forward its conventional argument separator to the script.
      continue
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`)
    }
  }
  if (!args.help && Boolean(args.slug) === Boolean(args.id)) {
    throw new Error('Name the article with exactly one of --slug or --id.')
  }
  if (argv.includes('--write') && argv.includes('--dry-run')) {
    throw new Error('--write and --dry-run contradict each other; pick one.')
  }
  return args
}

/** The report as a person reads it in a terminal. */
export function describeReport(report: ConversionReport): string {
  const lines = [
    `${report.slug} (id ${report.id}): ${report.convertible ? 'can be converted' : 'REFUSED'}`,
    '',
    `Plain text      ${report.plainText.equal ? 'identical' : 'DIFFERENT'} (${report.plainText.legacyCharacters} → ${report.plainText.convertedCharacters} characters, whitespace aside)`,
    `Heading ids     ${report.headingIds.equal ? 'all kept' : 'CHANGED'}`,
    ...report.headingIds.headings.map(
      (h) =>
        `    ${h.tag.padEnd(3)} ${h.legacy === null ? '+' : h.legacy === h.converted ? ' ' : '!'} #${h.legacy ?? '(none)'} → #${h.converted ?? '(none)'}  ${h.text}`,
    ),
    `Links           ${report.links.legacy} → ${report.links.converted}${report.links.missing.length ? `, missing ${report.links.missing.join(', ')}` : ''}${report.links.extra.length ? `, extra ${report.links.extra.join(', ')}` : ''}`,
    `Images          ${report.images.legacy} → ${report.images.converted}`,
    ...report.images.placed.map(
      (image) => `    ${image.src} → media ${image.media} (${image.as})`,
    ),
    `Markdown trip   ${report.roundTrip.unchanged ? 'unchanged' : `CHANGES: ${report.roundTrip.difference}`}`,
    `Cards           ${report.cards.length ? report.cards.map((c) => `${c.card} → ${c.block}`).join(', ') : 'none'}`,
  ]
  if (report.notes.length) {
    lines.push(
      '',
      'Left out on purpose:',
      ...report.notes.map((n) => `  - ${n}`),
    )
  }
  if (report.refused.length) {
    lines.push('', 'Refused:', ...report.refused.map((r) => `  - ${r}`))
  }
  return lines.join('\n')
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(
      'Usage: pnpm content:convert-legacy -- (--slug <slug> | --id <id>) [--dry-run | --write] [--json <path>]',
    )
    return
  }

  const [{ getPayload }, { default: config }, conversion] = await Promise.all([
    import('payload'),
    import('@payload-config'),
    import('../lib/mcp/convert-legacy'),
  ])
  const payload = await getPayload({ config })
  const access = { overrideAccess: true }

  const { docs } = await payload.find({
    collection: 'posts',
    depth: 0,
    draft: true,
    limit: 1,
    overrideAccess: true,
    where: args.id
      ? { id: { equals: args.id } }
      : { slug: { equals: args.slug } },
  })
  const doc = docs[0] as unknown as Record<string, unknown> | undefined
  if (!doc)
    throw new Error(
      `No post with ${args.id ? `id ${args.id}` : `slug ${args.slug}`}.`,
    )

  const article: LegacyArticle = {
    id: doc.id as number | string,
    slug: String(doc.slug ?? ''),
    title: String(doc.title ?? ''),
    legacyHTML: typeof doc.legacyHTML === 'string' ? doc.legacyHTML : '',
    content: doc.content,
  }
  const { report, state } = await conversion.planLegacyConversion(
    payload,
    article,
    access,
  )
  console.log(describeReport(report))

  let saved: { undo: string | null } | null = null
  if (args.write && report.convertible) {
    const { replacedVersion } = await conversion.saveLegacyConversion(
      payload,
      article,
      state,
      access,
    )
    saved = { undo: replacedVersion }
    console.log(
      `\nSaved as a draft; readers still get the published page until it is ` +
        `published. To undo, restore version ${replacedVersion ?? '(none)'} ` +
        '(scope body) — legacyHTML was not touched.',
    )
  } else if (args.write) {
    console.log('\nNothing saved: the conversion was refused.')
  } else {
    console.log('\nDry run: nothing saved. Pass --write to save as a draft.')
  }

  if (args.json) {
    await writeFile(
      resolve(args.json),
      `${JSON.stringify({ ...report, saved }, null, 2)}\n`,
    )
    console.log(`Wrote ${args.json}`)
  }
  if (!report.convertible) process.exitCode = 1
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main()
    .then(() =>
      process.exit(typeof process.exitCode === 'number' ? process.exitCode : 0),
    )
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    })
}
