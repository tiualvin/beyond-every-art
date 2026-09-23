// Merging and retiring tags without losing a URL.
//
// A tag archive is a live URL this site inherited from Ghost: `/tag/<slug>/` is
// in the sitemap whenever the tag has a published post, and it may carry
// inbound links. So retiring a tag is three changes that have to land in one
// order — a permanent redirect for its archive, the posts filed under it moved
// or unfiled, and only then the tag itself — and a merge is the same with the
// surviving tag as the redirect's destination.
//
// This module decides all of it from what is in the database, without touching
// the database, so the whole plan can be read before any of it runs:
// `scripts/apply-tag-plan.ts` loads the rows, calls `planTagChanges`, prints the
// result as its dry run, and applies it only when asked. Nothing here imports
// Payload.
//
// The rules it enforces, each of which is a way this goes wrong quietly:
//
//   - **A tag is retired whole or not at all.** If any post filed under it
//     cannot be moved safely, the tag is blocked: no redirect, no post edits
//     for it, no deletion. Half a retirement leaves chips linking to an archive
//     that redirects away from the posts they sit on.
//   - **No post is left without a subject by the plan.** A post that would end
//     with no subject tag blocks the tag that would have left it so, until the
//     plan says where the post goes (`assign`). Untagged posts are the problem
//     the taxonomy work exists to shrink; retiring a tag must not grow it.
//   - **A published post with an unpublished draft is left alone.** An update
//     carries one `_status`, and the latest version's is `draft` — writing it
//     would unpublish the article. Those are listed for an editor instead.
//   - **An existing redirect is never overwritten.** A row that already sends
//     the retired archive somewhere else is someone's decision; it blocks the
//     tag and is reported. A row that points *at* a retired archive is
//     re-aimed at the new destination, so no chain forms.
//   - **Tag order is kept.** The first tag labels the card, so a merged tag is
//     replaced where it stood and a retired one is removed in place.
//
// The plan is data (see `TagPlan`) and is meant to be committed beside the
// change that runs it, so the decision is reviewable in the same diff.

import { assignPigments } from '../design/pigments'
import { normalizePath } from '../seo/redirects'
import { tagPath } from '../seo/site'
import { isSubjectTag } from './topics'

type Id = string | number

/** A tag decision, as committed to the repository. */
export type TagPlan = {
  /** Fold `from` into `into`: its posts move, its archive redirects there. */
  merge?: { from: string; into: string; ghostPages?: number }[]
  /** Retire a tag: its posts lose it, its archive redirects to `redirectTo`. */
  retire?: { slug: string; redirectTo: string; ghostPages?: number }[]
  /**
   * The complete, ordered tag list for a post, by post slug and tag slug. The
   * first is the card label. Replaces whatever the post had.
   */
  assign?: Record<string, string[]>
}

export type PlanTag = { id: Id; slug: string; name: string }

/** One view of a post: the published row, or its latest version. */
export type PostView = { status: string | null; tagIds: Id[] }

export type PlanPost = {
  id: Id
  slug: string
  /** `draft: false`. Null when Payload has no published row to return. */
  published: PostView | null
  /** `draft: true` — what an editor sees and what an update starts from. */
  latest: PostView
}

export type PlanRedirect = {
  id: Id
  source: string
  destination: string
  statusCode?: string | number | null
  enabled?: boolean | null
}

export type Conflict = {
  kind: 'no_subject_left' | 'pending_draft' | 'redirect_clash'
  /** The retiring tags this conflict blocks. */
  blocks: string[]
  post?: string
  source?: string
  message: string
}

export type PostChange = {
  id: Id
  slug: string
  /** Carried into the write so a draft stays a draft. */
  status: string | null
  before: string[]
  after: string[]
  afterIds: Id[]
}

export type RedirectChange =
  | { action: 'create'; source: string; destination: string }
  | {
      action: 'retarget'
      id: Id
      source: string
      from: string
      destination: string
    }

/** `from` is null for a subject that has no swatch today. */
export type PigmentChange = { slug: string; from: string | null; to: string }

export type TagPlanResult = {
  /** Problems with the plan itself. When non-empty, nothing else is valid. */
  errors: string[]
  conflicts: Conflict[]
  /**
   * Retiring tags that will actually be retired this run, with every archive
   * path that must redirect before any post is touched.
   */
  retiring: {
    slug: string
    destination: string
    paths: string[]
    exists: boolean
  }[]
  /** Retiring tags held back by a conflict. */
  blocked: string[]
  redirects: RedirectChange[]
  /** Redirect rows already in place, needing nothing. */
  redirectsInPlace: string[]
  posts: PostChange[]
  /** Tag rows to delete once nothing refers to them. */
  deletable: { id: Id; slug: string }[]
  counts: {
    before: Record<string, number>
    after: Record<string, number>
    publishedWithoutSubject: { before: number; after: number }
  }
  /** Swatches whose pigment changes because the subject set changed. */
  pigments: PigmentChange[]
}

/** 301, as the built-in Ghost rules and the importer both use. */
export const RETIRED_TAG_STATUS = '301'

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function sameList(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/** `/tag/x/` plus the Ghost pagination pages it served, `/tag/x/page/2/`… */
export function retiredArchivePaths(slug: string, ghostPages = 1): string[] {
  const paths = [tagPath(slug)]
  for (let page = 2; page <= ghostPages; page++) {
    paths.push(`${tagPath(slug)}page/${page}/`)
  }
  return paths
}

function validDestination(destination: string): boolean {
  // Site-relative and slashed: an absolute URL would pin the host, and a
  // missing trailing slash is a second hop under `trailingSlash: true`.
  return (
    destination.startsWith('/') &&
    !destination.startsWith('//') &&
    destination.endsWith('/')
  )
}

export function planTagChanges(input: {
  plan: TagPlan
  tags: readonly PlanTag[]
  posts: readonly PlanPost[]
  redirects: readonly PlanRedirect[]
}): TagPlanResult {
  const { plan, tags, posts, redirects } = input
  const bySlug = new Map(tags.map((tag) => [tag.slug, tag]))
  const byId = new Map(tags.map((tag) => [String(tag.id), tag]))
  const slugOf = (id: Id) => byId.get(String(id))?.slug ?? `#${String(id)}`

  const errors: string[] = []
  const merges = plan.merge ?? []
  const retirements = plan.retire ?? []
  const assign = plan.assign ?? {}

  // --- The plan on its own terms --------------------------------------------

  const retiringSlugs = [
    ...merges.map((merge) => merge.from),
    ...retirements.map((retire) => retire.slug),
  ]
  for (const slug of retiringSlugs.filter(
    (slug, index) => retiringSlugs.indexOf(slug) !== index,
  )) {
    errors.push(`"${slug}" is retired or merged more than once`)
  }
  const retiringSet = new Set(retiringSlugs)

  for (const merge of merges) {
    if (merge.from === merge.into) {
      errors.push(`"${merge.from}" cannot be merged into itself`)
    }
    if (!bySlug.has(merge.into)) {
      errors.push(`merge target "${merge.into}" is not a tag`)
    }
    if (retiringSet.has(merge.into)) {
      errors.push(`merge target "${merge.into}" is itself being retired`)
    }
  }
  for (const entry of [...merges, ...retirements]) {
    const pages = entry.ghostPages
    if (
      pages !== undefined &&
      (!Number.isSafeInteger(pages) || pages < 1 || pages > 1000)
    ) {
      errors.push(`ghostPages must be a whole number from 1 to 1000`)
    }
  }
  for (const retire of retirements) {
    if (!validDestination(retire.redirectTo)) {
      errors.push(
        `"${retire.slug}" redirects to "${retire.redirectTo}", which is not a site path ending in a slash`,
      )
    }
    const target = normalizePath(retire.redirectTo)
    for (const slug of retiringSet) {
      if (target === normalizePath(tagPath(slug))) {
        errors.push(
          `"${retire.slug}" redirects to the archive of "${slug}", which is also being retired`,
        )
      }
    }
  }
  const postsBySlug = new Map(posts.map((post) => [post.slug, post]))
  for (const [postSlug, list] of Object.entries(assign)) {
    if (!postsBySlug.has(postSlug)) {
      errors.push(`assign names post "${postSlug}", which does not exist`)
    }
    if (list.length === 0) {
      errors.push(`assign gives "${postSlug}" no tags`)
    }
    for (const slug of list) {
      if (!bySlug.has(slug)) {
        errors.push(
          `assign gives "${postSlug}" tag "${slug}", which does not exist`,
        )
      } else if (retiringSet.has(slug)) {
        errors.push(
          `assign gives "${postSlug}" tag "${slug}", which is being retired`,
        )
      }
    }
    if (list.length > 0 && !list.some(isSubjectTag)) {
      errors.push(`assign gives "${postSlug}" no subject tag`)
    }
  }

  const destinationOf = new Map<string, string>([
    ...merges.map((merge) => [merge.from, tagPath(merge.into)] as const),
    ...retirements.map((retire) => [retire.slug, retire.redirectTo] as const),
  ])
  const ghostPagesOf = new Map<string, number>([
    ...merges.map((merge) => [merge.from, merge.ghostPages ?? 1] as const),
    ...retirements.map(
      (retire) => [retire.slug, retire.ghostPages ?? 1] as const,
    ),
  ])

  const empty = (): TagPlanResult => ({
    errors,
    conflicts: [],
    retiring: [],
    blocked: [],
    redirects: [],
    redirectsInPlace: [],
    posts: [],
    deletable: [],
    counts: {
      before: {},
      after: {},
      publishedWithoutSubject: { before: 0, after: 0 },
    },
    pigments: [],
  })
  if (errors.length > 0) return empty()

  // --- What each post becomes -----------------------------------------------

  const mergeInto = new Map(
    merges.map((merge) => [merge.from, bySlug.get(merge.into)!.id] as const),
  )

  /** The post's new tag ids, given which retiring tags are still going. */
  function rewrite(post: PlanPost, going: ReadonlySet<string>): Id[] {
    const assigned = assign[post.slug]
    if (assigned) return assigned.map((slug) => bySlug.get(slug)!.id)
    const next: Id[] = []
    for (const id of post.latest.tagIds) {
      const slug = slugOf(id)
      if (!going.has(slug)) next.push(id)
      else if (mergeInto.has(slug)) next.push(mergeInto.get(slug)!)
      // else: retired, dropped in place.
    }
    return unique(next.map(String)).map((key) =>
      next.find((id) => String(id) === key)!,
    )
  }

  const touchesRetiring = (view: PostView | null) =>
    view?.tagIds.map(slugOf).filter((slug) => retiringSet.has(slug)) ?? []

  const conflicts: Conflict[] = []

  for (const post of posts) {
    const referenced = unique([
      ...touchesRetiring(post.latest),
      ...touchesRetiring(post.published),
    ])
    const inPlan = referenced.length > 0 || post.slug in assign
    if (!inPlan) continue

    const pendingDraft =
      post.published?.status === 'published' && post.latest.status === 'draft'
    if (pendingDraft) {
      conflicts.push({
        kind: 'pending_draft',
        blocks: referenced,
        post: post.slug,
        message: `"${post.slug}" is published with unpublished changes; an update would carry the draft's status and unpublish it. Change its tags in the admin.`,
      })
      continue
    }

    const after = rewrite(post, retiringSet)
    if (
      referenced.length > 0 &&
      !(post.slug in assign) &&
      !after.map(slugOf).some(isSubjectTag)
    ) {
      conflicts.push({
        kind: 'no_subject_left',
        blocks: referenced,
        post: post.slug,
        message: `"${post.slug}" would be left without a subject tag; give it one under "assign".`,
      })
    }
  }

  // --- Redirects ------------------------------------------------------------

  const existingBySource = new Map(
    redirects.map((row) => [normalizePath(row.source), row]),
  )
  for (const slug of retiringSet) {
    const destination = destinationOf.get(slug)!
    for (const source of retiredArchivePaths(slug, ghostPagesOf.get(slug))) {
      const row = existingBySource.get(normalizePath(source))
      if (!row) continue
      const same =
        normalizePath(row.destination) === normalizePath(destination) &&
        String(row.statusCode ?? RETIRED_TAG_STATUS) === RETIRED_TAG_STATUS &&
        row.enabled !== false
      if (!same) {
        conflicts.push({
          kind: 'redirect_clash',
          blocks: [slug],
          source,
          message: `A redirect for ${source} already exists (to ${row.destination}, ${String(row.statusCode ?? '')}${row.enabled === false ? ', disabled' : ''}); resolve it in the admin first.`,
        })
      }
    }
  }

  const blocked = new Set(conflicts.flatMap((conflict) => conflict.blocks))
  const going = new Set([...retiringSet].filter((slug) => !blocked.has(slug)))

  const redirectChanges: RedirectChange[] = []
  const redirectsInPlace: string[] = []
  const retiredPathTo = new Map<string, string>()
  for (const slug of going) {
    const destination = destinationOf.get(slug)!
    for (const source of retiredArchivePaths(slug, ghostPagesOf.get(slug))) {
      retiredPathTo.set(normalizePath(source), destination)
      if (existingBySource.has(normalizePath(source))) {
        redirectsInPlace.push(source)
      } else {
        redirectChanges.push({ action: 'create', source, destination })
      }
    }
  }
  for (const row of redirects) {
    const aimedAt = retiredPathTo.get(normalizePath(row.destination))
    if (!aimedAt || retiredPathTo.has(normalizePath(row.source))) continue
    redirectChanges.push({
      action: 'retarget',
      id: row.id,
      source: row.source,
      from: row.destination,
      destination: aimedAt,
    })
  }

  // --- Post edits, for the tags actually going ------------------------------

  const postChanges: PostChange[] = []
  const pendingDraftPosts = new Set(
    conflicts
      .filter((conflict) => conflict.kind === 'pending_draft')
      .map((conflict) => conflict.post),
  )
  for (const post of posts) {
    if (pendingDraftPosts.has(post.slug)) continue
    const referencesGoing = post.latest.tagIds.some((id) =>
      going.has(slugOf(id)),
    )
    if (!referencesGoing && !(post.slug in assign)) continue
    // A post held back only by a blocked tag it shares with a going one still
    // moves off the going tag; the blocked one stays where it was.
    const after = rewrite(post, going)
    if (sameList(after.map(String), post.latest.tagIds.map(String))) continue
    postChanges.push({
      id: post.id,
      slug: post.slug,
      status: post.latest.status,
      before: post.latest.tagIds.map(slugOf),
      after: after.map(slugOf),
      afterIds: after,
    })
  }

  // --- What readers will see ------------------------------------------------

  const changedBySlug = new Map(
    postChanges.map((change) => [change.slug, change]),
  )
  const publishedPosts = posts.filter(
    (post) => post.published?.status === 'published',
  )
  const tally = (view: (post: PlanPost) => string[]) => {
    const counts: Record<string, number> = {}
    let withoutSubject = 0
    for (const post of publishedPosts) {
      const slugs = unique(view(post))
      for (const slug of slugs) counts[slug] = (counts[slug] ?? 0) + 1
      if (!slugs.some(isSubjectTag)) withoutSubject++
    }
    return { counts, withoutSubject }
  }
  const before = tally((post) => post.published!.tagIds.map(slugOf))
  const after = tally(
    (post) =>
      changedBySlug.get(post.slug)?.after ?? post.published!.tagIds.map(slugOf),
  )

  const subjects = (counts: Record<string, number>) =>
    Object.keys(counts).filter(
      (slug) => isSubjectTag(slug) && !slug.startsWith('#'),
    )
  const pigmentsBefore = assignPigments(subjects(before.counts))
  const pigmentsAfter = assignPigments(subjects(after.counts))
  const pigments: PigmentChange[] = []
  for (const [slug, pigment] of pigmentsAfter) {
    const was = pigmentsBefore.get(slug)
    if (was?.name !== pigment.name) {
      pigments.push({ slug, from: was?.name ?? null, to: pigment.name })
    }
  }

  return {
    errors,
    conflicts,
    retiring: [...going].sort().map((slug) => ({
      slug,
      destination: destinationOf.get(slug)!,
      paths: retiredArchivePaths(slug, ghostPagesOf.get(slug)),
      exists: bySlug.has(slug),
    })),
    blocked: [...blocked].sort(),
    redirects: redirectChanges,
    redirectsInPlace,
    posts: postChanges,
    deletable: [...going]
      .filter((slug) => bySlug.has(slug))
      .sort()
      .map((slug) => ({ id: bySlug.get(slug)!.id, slug })),
    counts: {
      before: before.counts,
      after: after.counts,
      publishedWithoutSubject: {
        before: before.withoutSubject,
        after: after.withoutSubject,
      },
    },
    pigments: pigments.sort((a, b) => a.slug.localeCompare(b.slug)),
  }
}

/**
 * A plan file's shape, checked before anything reads it. The meaning — which
 * slugs exist, which destinations are sound — is `planTagChanges`'s job; this
 * only refuses a file that is not a plan at all, so a typo in a key cannot
 * read as "retire nothing" and pass.
 */
export function parseTagPlan(value: unknown): TagPlan {
  const fail = (why: string): never => {
    throw new Error(`Not a tag plan: ${why}`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('expected a JSON object')
  }
  const record = value as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!['merge', 'retire', 'assign', '$comment'].includes(key)) {
      fail(`unknown key "${key}"`)
    }
  }
  const isString = (item: unknown): item is string =>
    typeof item === 'string' && item.length > 0
  const entries = (key: 'merge' | 'retire', fields: string[]) => {
    const list = record[key]
    if (list === undefined) return
    if (!Array.isArray(list)) fail(`"${key}" must be a list`)
    for (const entry of list as unknown[]) {
      const item = entry as Record<string, unknown>
      if (typeof entry !== 'object' || entry === null) {
        fail(`every "${key}" entry must be an object`)
      }
      for (const field of fields) {
        if (!isString(item[field])) fail(`"${key}" entry needs "${field}"`)
      }
      for (const field of Object.keys(item)) {
        if (![...fields, 'ghostPages'].includes(field)) {
          fail(`"${key}" entry has unknown field "${field}"`)
        }
      }
    }
  }
  entries('merge', ['from', 'into'])
  entries('retire', ['slug', 'redirectTo'])
  const assign = record.assign
  if (assign !== undefined) {
    if (
      typeof assign !== 'object' ||
      assign === null ||
      Array.isArray(assign)
    ) {
      fail('"assign" must map post slugs to lists of tag slugs')
    }
    for (const list of Object.values(assign as Record<string, unknown>)) {
      if (!Array.isArray(list) || !list.every(isString)) {
        fail('"assign" must map post slugs to lists of tag slugs')
      }
    }
  }
  return record as TagPlan
}

/** Every reference a set of posts still makes to the given tag slugs. */
export function remainingReferences(
  posts: readonly PlanPost[],
  tags: readonly PlanTag[],
  slugs: ReadonlySet<string>,
): { post: string; tag: string; view: 'published' | 'latest' }[] {
  const byId = new Map(tags.map((tag) => [String(tag.id), tag.slug]))
  const found: { post: string; tag: string; view: 'published' | 'latest' }[] =
    []
  for (const post of posts) {
    for (const [view, record] of [
      ['published', post.published],
      ['latest', post.latest],
    ] as const) {
      for (const id of record?.tagIds ?? []) {
        const slug = byId.get(String(id))
        if (slug && slugs.has(slug))
          found.push({ post: post.slug, tag: slug, view })
      }
    }
  }
  return found
}
