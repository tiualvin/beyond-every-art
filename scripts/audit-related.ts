// What "Read next" and the in-body house slots link to, across the whole site.
//
//   pnpm audit:related
//   pnpm audit:related --json related-audit.json
//   pnpm audit:related --snapshot posts.json --now 2026-10-24T12:00:00Z
//
// Flags:
//   --snapshot <path>  read live posts from a JSON file ({ posts: [...] }, each
//                      { slug, title, tags, publishedAt, migrated }) instead of
//                      the database — for running the numbers away from it
//   --now <iso>        the moment to rank at; defaults to now
//   --json <path>      also write the report as JSON. No default: the report
//                      lists slugs, and a default path would be one more file
//                      in the checkout to keep out of git
//
// Reads, never writes. It ranks every live post exactly as the page does —
// the same candidates query (`readRelatedCandidates`), the same ranking
// (`rankRelated`), the same pool size and split (`related.ts`) — and reports
// the site-wide numbers in `lib/content/related-audit.ts`, next to the same
// numbers for the newest-first query this replaced, run over the same posts.
//
// On the VPS:
//
//   docker compose run --rm migrate pnpm audit:related

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  auditRelated,
  legacyRelated,
  NARROW_TAG_SHARE,
  type AuditPost,
  type RelatedAudit,
} from '../lib/content/related-audit'
import { rankRelated } from '../lib/content/related-rank'
import { READ_NEXT_COUNT, RELATED_QUERY_LIMIT } from '../lib/content/related'

type Args = {
  snapshot?: string
  now?: string
  json?: string
  help: boolean
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--snapshot' && argv[index + 1]) {
      args.snapshot = argv[++index]
    } else if (argument === '--now' && argv[index + 1]) {
      args.now = argv[++index]
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
  return args
}

/** Whether a stored `ghostID` came from Ghost rather than `nativeGhostID()`. */
export function isMigratedGhostID(ghostID: unknown): boolean {
  return (
    typeof ghostID === 'string' && !!ghostID && !ghostID.startsWith('native:')
  )
}

async function loadFromDatabase(now: Date): Promise<AuditPost[]> {
  const [{ getPayload }, { default: config }, { readRelatedCandidates }] =
    await Promise.all([
      import('payload'),
      import('@payload-config'),
      import('../lib/content/queries'),
    ])
  const payload = await getPayload({ config })
  const candidates = await readRelatedCandidates(payload, now)
  const origins = await payload.find({
    collection: 'posts',
    overrideAccess: true,
    depth: 0,
    pagination: false,
    limit: 0,
    where: { slug: { in: candidates.map((candidate) => candidate.slug) } },
    select: { slug: true, ghostID: true },
  })
  const migrated = new Set(
    origins.docs
      .filter((doc) =>
        isMigratedGhostID((doc as { ghostID?: unknown }).ghostID),
      )
      .map((doc) => String((doc as { slug?: unknown }).slug)),
  )
  return candidates.map((candidate) => ({
    ...candidate,
    migrated: migrated.has(candidate.slug),
  }))
}

async function loadFromSnapshot(path: string): Promise<AuditPost[]> {
  const parsed = JSON.parse(await readFile(resolve(path), 'utf8')) as {
    posts?: AuditPost[]
  }
  if (!Array.isArray(parsed.posts)) {
    throw new Error(`${path} has no \`posts\` array.`)
  }
  return parsed.posts.map((post) => ({
    slug: post.slug,
    title: post.title,
    tags: post.tags ?? [],
    publishedAt: post.publishedAt ?? null,
    migrated: Boolean(post.migrated),
  }))
}

const percent = (share: number): string => `${(share * 100).toFixed(1)}%`

function describe(label: string, audit: RelatedAudit): string {
  return [
    `${label}`,
    `  "Read next" targets          ${audit.readNextTargets} different posts across ${audit.pages} pages`,
    `  Anywhere (incl. house slots) ${audit.poolTargets}`,
    `  Largest share of one post    ${percent(audit.maxShare)} of "Read next" rows`,
    ...audit.mostShown.map(
      (entry) =>
        `      ${String(entry.pages).padStart(4)}  ${percent(entry.share).padStart(6)}  ${entry.slug}`,
    ),
    `  Migrated in "Read next"      ${audit.migratedInReadNext} of ${audit.migratedTotal}`,
    `  Migrated anywhere            ${audit.migratedInPool} of ${audit.migratedTotal}`,
    `  Pages with ≥2 same-topic     ${audit.pagesWithTwoSameTopic} of ${audit.pages}`,
  ].join('\n')
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(
      'Usage: pnpm audit:related -- [--snapshot <path>] [--now <iso>] [--json <path>]',
    )
    return
  }

  const now = args.now ? new Date(args.now) : new Date()
  if (Number.isNaN(now.getTime()))
    throw new Error(`--now: not a time: ${args.now}`)

  const posts = args.snapshot
    ? await loadFromSnapshot(args.snapshot)
    : await loadFromDatabase(now)

  const options = {
    readNextCount: READ_NEXT_COUNT,
    poolSize: RELATED_QUERY_LIMIT,
  }
  const before = auditRelated(
    posts,
    (subject, candidates, limit) => legacyRelated(subject, candidates, limit),
    options,
  )
  const after = auditRelated(
    posts,
    (subject, candidates, limit) =>
      rankRelated(subject, candidates, limit, now),
    options,
  )

  console.log(
    `Related posts across ${posts.length} live posts, ranked at ${now.toISOString()}.\n` +
      `"Same-topic": a meaningful title or slug word in common, or a tag on ` +
      `fewer than ${percent(NARROW_TAG_SHARE)} of live posts.\n`,
  )
  console.log(
    describe(
      'Before — same tags, newest first, topped up with the newest',
      before,
    ),
  )
  console.log('')
  console.log(
    describe(
      'After — ranked by relevance (lib/content/related-rank.ts)',
      after,
    ),
  )

  if (args.json) {
    await writeFile(
      resolve(args.json),
      `${JSON.stringify({ rankedAt: now.toISOString(), before, after }, null, 2)}\n`,
    )
    console.log(`\nWrote ${args.json}`)
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    })
}
