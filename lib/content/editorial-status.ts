// Work that is saved but not out, read the way a person means the question.
//
// "Draft" means two different things in Payload, and the difference cost a
// week. A post has a live row — what the site serves — and a history of
// versions, the newest of which is what the admin's edit screen and any
// `draft: true` read show. Saving a draft over a published article writes a new
// version and leaves the live row alone, so the article stays on the site,
// unchanged, while every editorial view calls it a draft.
//
// On 14 Oct 2026 twenty published articles were in that state, from agent edits
// saved on 5 and 7 Oct and never published. Read one way they were twenty
// "drafts that never went live"; read the other they were live posts with
// nothing wrong at all. Both readings were wrong, and nothing on the dashboard
// could tell them apart: it counted the live row only.
//
// So this names the three states that are actually different, each with what it
// means for a reader:
//
//   liveWithChanges       on the site; the newer draft is not
//   scheduledWithChanges  will go out on its date as last published, not as drafted
//   draftsPastTheirDate   never published, naming a date that has passed — a
//                         date schedules nothing on a draft (`schedule.ts`)
//
// Read with the caller's own access, so an author is told about their own work
// and nobody else's. Used by the admin dashboard and by the `editorialStatus`
// MCP tool, so the two can never give different answers.

import type { Payload, TypedUser, Where } from 'payload'

import { isScheduled } from './schedule'

export type PendingArticle = {
  id: number | string
  /** The address readers use: the live row's, where there is one. */
  slug: string
  title: string
  /**
   * The date a reader is shown, for a published article; for one never
   * published, the date its draft names.
   */
  publishedAt: string | null
  /** When the unpublished version was saved. */
  savedAt: string | null
}

export type UnpublishedWork = {
  liveWithChanges: PendingArticle[]
  scheduledWithChanges: PendingArticle[]
  draftsPastTheirDate: PendingArticle[]
}

type Raw = {
  id: number | string
  slug?: unknown
  title?: unknown
  publishedAt?: unknown
  updatedAt?: unknown
}

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : null

const byDate = (a: PendingArticle, b: PendingArticle): number =>
  (a.publishedAt ?? '').localeCompare(b.publishedAt ?? '')

/**
 * Every post whose newest version is a draft, sorted into what that means.
 *
 * Two reads: the newest versions that are drafts (`draft: true` reads the
 * version table), then the live rows of those same posts. Bodies are never
 * selected.
 */
export async function findUnpublishedWork(
  payload: Payload,
  { user, now = new Date() }: { user?: TypedUser | null; now?: Date } = {},
): Promise<UnpublishedWork> {
  const access = { overrideAccess: false, user: user ?? undefined } as const

  const latest = await payload.find({
    collection: 'posts',
    ...access,
    depth: 0,
    draft: true,
    limit: 0,
    pagination: false,
    select: { slug: true, title: true, publishedAt: true, updatedAt: true },
    where: { _status: { equals: 'draft' } },
  })
  const drafts = latest.docs as unknown as Raw[]
  if (drafts.length === 0) {
    return {
      liveWithChanges: [],
      scheduledWithChanges: [],
      draftsPastTheirDate: [],
    }
  }

  const livePublished: Where = {
    and: [
      { id: { in: drafts.map((doc) => doc.id) } },
      { _status: { equals: 'published' } },
    ],
  }
  const published = await payload.find({
    collection: 'posts',
    ...access,
    depth: 0,
    limit: 0,
    pagination: false,
    select: { publishedAt: true, slug: true },
    where: livePublished,
  })
  // The live row's date and address: what readers see, which a draft may
  // since have changed.
  const liveRow = new Map(
    (published.docs as unknown as Raw[]).map((doc) => [
      String(doc.id),
      { publishedAt: asString(doc.publishedAt), slug: asString(doc.slug) },
    ]),
  )

  const work: UnpublishedWork = {
    liveWithChanges: [],
    scheduledWithChanges: [],
    draftsPastTheirDate: [],
  }

  for (const doc of drafts) {
    const article = (
      publishedAt: string | null,
      slug = asString(doc.slug),
    ): PendingArticle => ({
      id: doc.id,
      slug: slug ?? '',
      title: asString(doc.title) ?? asString(doc.slug) ?? String(doc.id),
      publishedAt,
      savedAt: asString(doc.updatedAt),
    })

    const live = liveRow.get(String(doc.id))
    if (live) {
      const entry = article(live.publishedAt, live.slug ?? asString(doc.slug))
      if (isScheduled('published', live.publishedAt, now)) {
        work.scheduledWithChanges.push(entry)
      } else {
        work.liveWithChanges.push(entry)
      }
      continue
    }

    const named = asString(doc.publishedAt)
    const at = named ? Date.parse(named) : NaN
    if (Number.isFinite(at) && at <= now.getTime()) {
      work.draftsPastTheirDate.push(article(named))
    }
  }

  work.liveWithChanges.sort(byDate)
  work.scheduledWithChanges.sort(byDate)
  work.draftsPastTheirDate.sort(byDate)
  return work
}
