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

import { DEFAULT_LOCALE, type Locale } from '../i18n/locales'
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
  // A newest version can be a draft without English having changed at all: a
  // translation saved as a draft writes one, and so does publishing a single
  // language (Payload keeps a draft "snapshot" as the newest version). Those
  // are not English work waiting, so an article *with translations* whose
  // English fields in its newest version equal the live row's is left out.
  // An article with no translation is judged exactly as it always was.
  const drafts = (await withoutTranslationOnlyDrafts(
    payload,
    latest.docs as unknown as Raw[],
    access,
  )) as Raw[]
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

type Access = { overrideAccess: false; user?: TypedUser }

type ByLocale = Record<string, unknown> | null | undefined

const at = (value: unknown, locale: Locale): number => {
  const raw =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)[locale]
      : undefined
  const time =
    raw instanceof Date
      ? raw.getTime()
      : typeof raw === 'string'
        ? Date.parse(raw)
        : NaN
  return Number.isFinite(time) ? time : NaN
}

/**
 * Whether a language has a draft nobody published: its last draft save is
 * later than its last publish. Two dates, no bodies — which is what lets the
 * dashboard ask it on every load. A draft never saved in that language (no
 * `draftedAt`) has nothing pending in it.
 */
export function pendingIn(
  newest: { draftedAt?: ByLocale } | null | undefined,
  live: { modifiedAt?: ByLocale; updatedAt?: unknown } | null | undefined,
  locale: Locale,
): boolean {
  const drafted = at(newest?.draftedAt, locale)
  if (!Number.isFinite(drafted)) return false
  let published = at(live?.modifiedAt, locale)
  if (!Number.isFinite(published) && locale === DEFAULT_LOCALE) {
    const updated = live?.updatedAt
    published =
      updated instanceof Date
        ? updated.getTime()
        : typeof updated === 'string'
          ? Date.parse(updated)
          : NaN
  }
  return !Number.isFinite(published) || drafted > published
}

/**
 * Drops articles whose newest draft carries no English change.
 *
 * Only articles that have a translation are judged this way. An article in
 * English alone keeps the rule it always had — any newest version that is a
 * draft is English work waiting — so nothing changes for one of those.
 */
async function withoutTranslationOnlyDrafts(
  payload: Payload,
  drafts: Raw[],
  access: Access,
): Promise<Raw[]> {
  if (drafts.length === 0) return drafts
  const ids = drafts.map((doc) => doc.id)
  const read = (draft: boolean) =>
    payload.find({
      collection: 'posts',
      ...access,
      depth: 0,
      draft,
      limit: 0,
      locale: 'all',
      pagination: false,
      select: {
        title: true,
        translationStatus: true,
        draftedAt: true,
        modifiedAt: true,
        updatedAt: true,
      } as const,
      where: { and: [{ id: { in: ids } }] },
    })
  const [newest, live] = await Promise.all([read(true), read(false)])
  const liveById = new Map(
    (live.docs as unknown as Array<Record<string, unknown>>).map((doc) => [
      String(doc.id),
      doc,
    ]),
  )
  const translationOnly = new Set<string>()
  for (const doc of newest.docs as unknown as Array<Record<string, unknown>>) {
    const row = liveById.get(String(doc.id))
    if (!row) continue
    if (!hasTranslation(doc) && !hasTranslation(row)) continue
    if (!pendingIn(doc, row, DEFAULT_LOCALE))
      translationOnly.add(String(doc.id))
  }
  return drafts.filter((doc) => !translationOnly.has(String(doc.id)))
}

/** Whether a document read with `locale: 'all'` carries any other language. */
function hasTranslation(doc: Record<string, unknown>): boolean {
  for (const field of ['title', 'translationStatus'] as const) {
    const value = doc[field]
    if (value && typeof value === 'object') {
      for (const [locale, text] of Object.entries(value)) {
        if (locale !== DEFAULT_LOCALE && text) return true
      }
    }
  }
  return false
}

/** One translated language's schedule and unpublished work. */
export type TranslationWork = {
  scheduled: PendingArticle[]
  wentLive: PendingArticle[]
  /** Never published in this language, with a draft saved. */
  drafts: PendingArticle[]
  /** Published in this language, with a newer draft nobody published. */
  liveWithChanges: PendingArticle[]
}

/**
 * What `editorialStatus` reports for one translated language: what is due to
 * go out in it, what went out recently, and what is saved but not out. Reads
 * titles, slugs and dates only, as the English report does.
 */
export async function findTranslationWork(
  payload: Payload,
  locale: Locale,
  {
    user,
    now = new Date(),
    spanDays = 14,
  }: { user?: TypedUser | null; now?: Date; spanDays?: number } = {},
): Promise<TranslationWork> {
  const access = { overrideAccess: false, user: user ?? undefined } as const
  const span = spanDays * 24 * 60 * 60 * 1000
  const nowIso = now.toISOString()
  const pick = (
    doc: Record<string, unknown>,
    when: unknown,
  ): PendingArticle => ({
    id: doc.id as number | string,
    slug: asString(doc.slug) ?? '',
    title: asString(doc.title) ?? asString(doc.slug) ?? String(doc.id),
    publishedAt: asString(when),
    savedAt: asString(doc.updatedAt),
  })
  const inLocale = {
    collection: 'posts' as const,
    ...access,
    depth: 0,
    fallbackLocale: false as const,
    limit: 100,
    locale,
    select: {
      slug: true,
      title: true,
      translationStatus: true,
      translationPublishedAt: true,
      draftedAt: true,
      modifiedAt: true,
      updatedAt: true,
      _status: true,
    } as const,
  }
  const published: Where[] = [
    { _status: { equals: 'published' } },
    { translationStatus: { equals: 'published' } },
  ]

  const [scheduled, wentLive, newest] = await Promise.all([
    payload.find({
      ...inLocale,
      sort: 'translationPublishedAt',
      where: {
        and: [
          ...published,
          { translationPublishedAt: { greater_than: nowIso } },
          {
            translationPublishedAt: {
              less_than_equal: new Date(now.getTime() + span).toISOString(),
            },
          },
        ],
      },
    }),
    payload.find({
      ...inLocale,
      sort: '-translationPublishedAt',
      where: {
        and: [
          ...published,
          { translationPublishedAt: { less_than_equal: nowIso } },
          {
            translationPublishedAt: {
              greater_than: new Date(now.getTime() - span).toISOString(),
            },
          },
        ],
      },
    }),
    // Newest versions with a draft ever saved in this language.
    payload.find({
      ...inLocale,
      draft: true,
      limit: 0,
      pagination: false,
      where: { draftedAt: { exists: true } },
    }),
  ])

  const newestDocs = newest.docs as unknown as Array<Record<string, unknown>>
  const live = newestDocs.length
    ? await payload.find({
        ...inLocale,
        limit: 0,
        pagination: false,
        where: { id: { in: newestDocs.map((doc) => doc.id) } },
      })
    : { docs: [] }
  const liveById = new Map(
    (live.docs as unknown as Array<Record<string, unknown>>).map((doc) => [
      String(doc.id),
      doc,
    ]),
  )

  // Read in one language, the localized dates are plain values; wrap them so
  // `pendingIn`, which takes an all-languages row, reads the same thing.
  const asAll = (doc: Record<string, unknown> | undefined) =>
    doc
      ? {
          draftedAt: { [locale]: doc.draftedAt },
          modifiedAt: { [locale]: doc.modifiedAt },
        }
      : null

  const drafts: PendingArticle[] = []
  const liveWithChanges: PendingArticle[] = []
  for (const doc of newestDocs) {
    const row = liveById.get(String(doc.id))
    const isLive =
      row?._status === 'published' && row?.translationStatus === 'published'
    if (!isLive) {
      if (asString(doc.title))
        drafts.push(pick(doc, doc.translationPublishedAt))
      continue
    }
    if (pendingIn(asAll(doc), asAll(row), locale)) {
      liveWithChanges.push(pick(row!, row!.translationPublishedAt))
    }
  }

  return {
    scheduled: (
      scheduled.docs as unknown as Array<Record<string, unknown>>
    ).map((doc) => pick(doc, doc.translationPublishedAt)),
    wentLive: (wentLive.docs as unknown as Array<Record<string, unknown>>).map(
      (doc) => pick(doc, doc.translationPublishedAt),
    ),
    drafts,
    liveWithChanges,
  }
}
