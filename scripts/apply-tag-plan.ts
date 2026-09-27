// CLI entry point for merging and retiring tags.
//
//   pnpm tags:apply --plan <file> --dry-run
//   pnpm tags:apply --plan <file> --site https://www.beyondeveryart.com
//   pnpm tags:apply --plan <file> --site https://www.beyondeveryart.com --delete-retired
//
// Flags:
//   --plan <path>          the committed plan: merge, retire, assign (required)
//   --dry-run              report only; no database writes
//   --site <origin>        the public site, asked whether each retired archive
//                          already redirects before any post is touched
//   --wait-minutes <n>     how long to keep asking (default 15)
//   --no-live-check        skip asking; only for a database with no site in
//                          front of it, such as a local rehearsal
//   --delete-retired       delete the retired tag rows once nothing refers to
//                          them, in either view of any post
//   --report <path>        default .migration-reports/tag-plan-report.json
//
// What it decides and why is in `lib/content/tag-plan.ts`; this file only loads
// rows, applies the result in order, and checks that it landed.
//
// **The order is the point.** A retired archive must already answer with its
// redirect before the posts filed under it move, or there is a window in which
// it serves a thin "nothing filed here" page or a 404 to whoever follows a link
// to it. Redirect rows written from here do not purge the application's caches
// (`revalidateTag` only works inside the Next process), so a new row can take
// up to the cached read's ten minutes plus the middleware's one to be served.
// Rather than guess, the script asks the live site and waits. Subjects the
// plan creates are made only after that, then everything is planned again so
// posts are written with the new tags' real ids.
//
// Writes go through `payload.update`, not SQL, so each post's version history
// moves with it — the same reasoning as `fix-ghost-url-placeholders.ts` — and
// carry `_status` explicitly, taken from the version being written, so a draft
// stays a draft. A published post with an unpublished draft is never written
// at all; the planner lists it for an editor, because the only status an
// update could carry for it is the draft's.
//
// Reruns are safe: a post already moved, a row already present and a tag
// already deleted all plan to nothing.
//
// Run it where the database is. On the VPS the plan is in the image, since it
// is committed, but the report directory needs mounting to survive `--rm`:
//
//   docker compose run --rm \
//     -v "$PWD/.migration-reports:/app/.migration-reports" \
//     migrate pnpm tags:apply --plan <file> --dry-run

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { Payload } from 'payload'

import {
  parseTagPlan,
  planTagChanges,
  remainingReferences,
  RETIRED_TAG_STATUS,
  type PlanPost,
  type PlanRedirect,
  type PlanTag,
  type TagPlanResult,
} from '../lib/content/tag-plan'

interface Cli {
  planPath: string
  dryRun: boolean
  site?: string
  waitMinutes: number
  liveCheck: boolean
  deleteRetired: boolean
  reportPath: string
}

function flagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  if (index < 0) return undefined
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value`)
  return value
}

export function parseArgs(argv: string[]): Cli {
  const planPath = flagValue(argv, '--plan')
  if (!planPath) throw new Error('Provide --plan <file>')
  const dryRun = argv.includes('--dry-run')
  const site = flagValue(argv, '--site')
  const liveCheck = !argv.includes('--no-live-check')
  if (!dryRun && liveCheck && !site) {
    throw new Error(
      'A real run needs --site <origin>, so it can confirm each retired archive redirects before posts move (or --no-live-check for a database with no site in front of it)',
    )
  }
  if (site) {
    const url = new URL(site)
    if (url.origin !== site.replace(/\/$/, '')) {
      throw new Error(
        '--site must be a bare origin, such as https://www.example.com',
      )
    }
  }
  const wait = Number(flagValue(argv, '--wait-minutes') ?? 15)
  if (!Number.isFinite(wait) || wait <= 0) {
    throw new Error('--wait-minutes must be a positive number')
  }
  return {
    planPath,
    dryRun,
    site: site?.replace(/\/$/, ''),
    waitMinutes: wait,
    liveCheck,
    deleteRetired: argv.includes('--delete-retired'),
    reportPath:
      flagValue(argv, '--report') ?? '.migration-reports/tag-plan-report.json',
  }
}

type Fetch = typeof fetch

/**
 * Whether the site already answers `path` with a permanent redirect to
 * `destination`. The Location may be absolute (middleware resolves it against
 * the forwarded origin) or relative; either names the same path.
 */
export async function redirectIsLive(
  site: string,
  path: string,
  destination: string,
  fetchImplementation: Fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImplementation(new URL(path, site), {
      redirect: 'manual',
      headers: { 'user-agent': 'BeyondEveryArt-TagPlan/1.0' },
    })
    await response.body?.cancel()
    if (response.status !== 301 && response.status !== 308) return false
    const location = response.headers.get('location')
    if (!location) return false
    return (
      new URL(location, site).pathname === new URL(destination, site).pathname
    )
  } catch {
    return false
  }
}

type RawDoc = {
  id: string | number
  slug?: string | null
  name?: string | null
  tags?: (string | number | { id: string | number })[] | null
  _status?: string | null
  source?: string | null
  destination?: string | null
  statusCode?: string | null
  enabled?: boolean | null
}

const tagIds = (doc: RawDoc) =>
  (doc.tags ?? []).map((tag) => (typeof tag === 'object' ? tag.id : tag))

async function load(payload: Payload): Promise<{
  tags: PlanTag[]
  posts: PlanPost[]
  redirects: PlanRedirect[]
}> {
  const all = async (
    collection: 'tags' | 'posts' | 'redirects',
    draft = false,
  ) =>
    (
      await payload.find({
        collection,
        depth: 0,
        draft,
        pagination: false,
        overrideAccess: true,
      })
    ).docs as unknown as RawDoc[]

  const [tagDocs, published, latest, redirectDocs] = await Promise.all([
    all('tags'),
    all('posts', false),
    all('posts', true),
    all('redirects'),
  ])
  const publishedById = new Map(published.map((doc) => [String(doc.id), doc]))

  return {
    tags: tagDocs.map((doc) => ({
      id: doc.id,
      slug: doc.slug ?? '',
      name: doc.name ?? '',
    })),
    posts: latest.map((doc) => {
      const row = publishedById.get(String(doc.id))
      return {
        id: doc.id,
        slug: doc.slug ?? String(doc.id),
        published: row
          ? { status: row._status ?? null, tagIds: tagIds(row) }
          : null,
        latest: { status: doc._status ?? null, tagIds: tagIds(doc) },
      }
    }),
    redirects: redirectDocs.map((doc) => ({
      id: doc.id,
      source: doc.source ?? '',
      destination: doc.destination ?? '',
      statusCode: doc.statusCode ?? null,
      enabled: doc.enabled ?? null,
    })),
  }
}

function summarise(result: TagPlanResult): string {
  const lines = [
    `Creating: ${result.creates.map((tag) => `${tag.slug} ("${tag.name}")`).join(', ') || '(none)'}`,
    `Retiring: ${result.retiring.map((tag) => `${tag.slug} -> ${tag.destination}`).join(', ') || '(none)'}`,
    `Blocked: ${result.blocked.join(', ') || '(none)'}`,
    `Redirects to create or re-aim: ${result.redirects.length} (already in place: ${result.redirectsInPlace.length})`,
    `Posts to change: ${result.posts.length}`,
    `Tag rows that can go: ${result.deletable.map((tag) => tag.slug).join(', ') || '(none)'}`,
    `Published posts without a subject: ${result.counts.publishedWithoutSubject.before} -> ${result.counts.publishedWithoutSubject.after}`,
    `Swatches that change colour: ${result.pigments.map((p) => `${p.slug} ${p.from ?? '(new)'} -> ${p.to}`).join(', ') || '(none)'}`,
  ]
  for (const conflict of result.conflicts) {
    lines.push(`CONFLICT ${conflict.kind}: ${conflict.message}`)
  }
  for (const error of result.errors) lines.push(`ERROR ${error}`)
  return `${lines.join('\n')}\n`
}

async function writeReport(path: string, report: unknown): Promise<void> {
  const absolute = resolve(path)
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  })
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2))
  const plan = parseTagPlan(
    JSON.parse(await readFile(resolve(cli.planPath), 'utf8')),
  )

  const [{ getPayload }, { default: config }] = await Promise.all([
    import('payload'),
    import('@payload-config'),
  ])
  const payload = await getPayload({ config })

  const loaded = await load(payload)
  const result = planTagChanges({ plan, ...loaded })
  const errors: string[] = []
  const report: Record<string, unknown> = {
    mode: cli.dryRun ? 'dry-run' : 'apply',
    plan: cli.planPath,
    ...result,
    errors,
  }
  errors.push(...result.errors)

  const finish = async () => {
    await writeReport(cli.reportPath, report)
    process.stdout.write(summarise({ ...result, errors }))
    process.stdout.write(`Report: ${resolve(cli.reportPath)}\n`)
    const incomplete =
      errors.length > 0 || (!cli.dryRun && result.conflicts.length > 0)
    if (incomplete) process.exitCode = 1
  }

  if (cli.dryRun || result.errors.length > 0) return finish()

  // 1. Redirects first, so no retired archive is ever unanswered.
  const note = `Retired by ${cli.planPath} on ${new Date().toISOString().slice(0, 10)}.`
  for (const change of result.redirects) {
    try {
      if (change.action === 'create') {
        await payload.create({
          collection: 'redirects',
          data: {
            source: change.source,
            destination: change.destination,
            statusCode: RETIRED_TAG_STATUS,
            enabled: true,
            notes: note,
          },
          overrideAccess: true,
        })
      } else {
        await payload.update({
          collection: 'redirects',
          id: change.id,
          data: { destination: change.destination },
          overrideAccess: true,
        })
      }
    } catch (error) {
      errors.push(
        `redirect ${change.source}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  if (errors.length > 0) return finish()

  // 2. Wait until the site serves them. Nothing below runs until it does.
  if (cli.liveCheck && cli.site) {
    const deadline = Date.now() + cli.waitMinutes * 60_000
    const pending = new Map(
      result.retiring.flatMap((tag) =>
        tag.paths.map((path) => [path, tag.destination] as const),
      ),
    )
    while (pending.size > 0) {
      for (const [path, destination] of pending) {
        if (await redirectIsLive(cli.site, path, destination)) {
          pending.delete(path)
        }
      }
      if (pending.size === 0) break
      if (Date.now() > deadline) {
        errors.push(
          `Still not redirecting after ${cli.waitMinutes} minutes: ${[...pending.keys()].join(', ')}. The rows are in place; rerun once they are served (a restart of the app container serves them at once).`,
        )
        report.stillWaitingFor = [...pending.keys()]
        return finish()
      }
      await new Promise((settle) => setTimeout(settle, 15_000))
    }
    report.redirectsConfirmedLive = true
  }

  // 3. The new subjects, created only now, so an archive with nothing in it is
  //    public for seconds rather than for the redirect wait — then planned
  //    again, so posts are filed under the real ids rather than placeholders.
  let posts = result.posts
  let baseline = loaded
  if (result.creates.length > 0) {
    const created: string[] = []
    for (const entry of result.creates) {
      try {
        await payload.create({
          collection: 'tags',
          data: { name: entry.name, slug: entry.slug },
          overrideAccess: true,
        })
        created.push(entry.slug)
      } catch (error) {
        errors.push(
          `tag ${entry.slug}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    report.tagsCreated = created
    if (errors.length > 0) return finish()

    baseline = await load(payload)
    const replanned = planTagChanges({ plan, ...baseline })
    const slugs = (changes: typeof posts) =>
      changes.map((change) => change.slug).join(',')
    if (
      replanned.errors.length > 0 ||
      replanned.creates.length > 0 ||
      slugs(replanned.posts) !== slugs(result.posts)
    ) {
      errors.push(
        'The plan changed once the new tags existed, so no post was moved. Rerun: the tags are in place and it will plan from them.',
      )
      report.replanned = replanned
      return finish()
    }
    posts = replanned.posts
  }

  // 4. Posts, each re-read first so a post edited since the plan is skipped
  //    rather than overwritten.
  const updated: string[] = []
  const skipped: { post: string; reason: string }[] = []
  for (const change of posts) {
    try {
      const [latest, published] = (await Promise.all([
        payload.findByID({
          collection: 'posts',
          id: change.id,
          depth: 0,
          draft: true,
          overrideAccess: true,
        }),
        payload.findByID({
          collection: 'posts',
          id: change.id,
          depth: 0,
          draft: false,
          overrideAccess: true,
        }),
      ])) as unknown as [RawDoc, RawDoc]
      const planned = baseline.posts.find((post) => post.id === change.id)!
      const current = tagIds(latest).map(String).join(',')
      if (
        current !== planned.latest.tagIds.map(String).join(',') ||
        (latest._status ?? null) !== change.status ||
        (published._status === 'published' && latest._status === 'draft')
      ) {
        skipped.push({
          post: change.slug,
          reason: 'changed since the plan was made',
        })
        continue
      }
      await payload.update({
        collection: 'posts',
        id: change.id,
        data: {
          tags: change.afterIds,
          // Never let this default: see the header.
          _status: change.status,
        } as never,
        overrideAccess: true,
      })
      updated.push(change.slug)
    } catch (error) {
      errors.push(
        `post ${change.slug}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  report.postsUpdated = updated
  report.postsSkipped = skipped

  // 5. Re-read everything rather than trusting the writes.
  const after = await load(payload)
  const going = new Set(result.retiring.map((tag) => tag.slug))
  const remaining = remainingReferences(after.posts, after.tags, going)
  report.remainingReferences = remaining
  for (const change of posts.filter((c) => updated.includes(c.slug))) {
    const post = after.posts.find((p) => p.id === change.id)
    const want = change.afterIds.map(String).join(',')
    for (const view of [post?.latest, post?.published]) {
      if (view && view.tagIds.map(String).join(',') !== want) {
        errors.push(`post ${change.slug} did not land as planned`)
        break
      }
    }
  }
  if (remaining.length > 0) {
    errors.push(
      `${remaining.length} reference(s) to retired tags remain; see remainingReferences`,
    )
  }

  // 6. Only now, and only when asked, the tag rows themselves.
  if (cli.deleteRetired && errors.length === 0 && skipped.length === 0) {
    const deleted: string[] = []
    for (const tag of result.deletable) {
      const still = remainingReferences(
        after.posts,
        after.tags,
        new Set([tag.slug]),
      )
      if (still.length > 0) continue
      try {
        await payload.delete({
          collection: 'tags',
          id: tag.id,
          overrideAccess: true,
        })
        deleted.push(tag.slug)
      } catch (error) {
        errors.push(
          `tag ${tag.slug}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    report.tagsDeleted = deleted
  }

  return finish()
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
      process.exit(1)
    })
}
