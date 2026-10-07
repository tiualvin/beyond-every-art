// What the site renders for a publication, decided from what Payload returns.
//
// Pure, and kept apart from the reads in `queries.ts`, so the shapes and their
// fallbacks can be unit tested without a database — the same split
// `lib/content/media.ts` makes for images. Everything the archive, the landing
// page and later the reader show about an issue passes through here.

import { toMediaImage, type MediaImage } from '../content/media'

import type { ReadingDirection } from './spreads'

/** One line of an issue's table of contents. */
export type ContentsEntry = {
  /** The heading it sits under, or empty when the issue uses none. */
  section: string
  title: string
  /** The page it starts on, when the editor gave one. */
  page: number | null
}

/** Consecutive entries under one heading, in issue order. */
export type ContentsSection = {
  section: string
  entries: ContentsEntry[]
}

/** An issue as the archive lists it. */
export type PublicationCard = {
  id: string
  slug: string
  title: string
  subtitle: string
  issueNumber: string
  series: string
  description: string
  cover: MediaImage | null
  publishedAt: string | null
}

/** An issue as its landing page shows it. */
export type PublicationDetail = PublicationCard & {
  contents: ContentsEntry[]
  readingDirection: ReadingDirection
  firstPageIsCover: boolean
  metaTitle: string | null
  metaDescription: string | null
  updatedAt: string | null
}

/** A publications document as Payload returns it, typed only as far as read. */
export type RawPublication = {
  id?: string | number
  slug?: unknown
  title?: unknown
  subtitle?: unknown
  issueNumber?: unknown
  series?: unknown
  description?: unknown
  cover?: unknown
  publishedAt?: unknown
  contents?: unknown
  readingDirection?: unknown
  firstPageIsCover?: unknown
  metaTitle?: unknown
  metaDescription?: unknown
  updatedAt?: unknown
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function optionalText(value: unknown): string | null {
  return text(value) || null
}

/**
 * A page number an editor typed, or null.
 *
 * The field has `min: 1`, but a restore or an import never ran the validator,
 * and a contents line pointing at page 0 or page 2.5 is worse than one with no
 * number at all.
 */
function pageNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
    ? value
    : null
}

/** The issue as the archive lists it, or null when it has no address. */
export function toPublicationCard(
  doc: RawPublication | null | undefined,
): PublicationCard | null {
  const slug = text(doc?.slug)
  const title = text(doc?.title)
  if (!doc || !slug || !title) return null

  return {
    id: String(doc.id ?? slug),
    slug,
    title,
    subtitle: text(doc.subtitle),
    issueNumber: text(doc.issueNumber),
    series: text(doc.series),
    description: text(doc.description),
    cover: toMediaImage(doc.cover),
    publishedAt: optionalText(doc.publishedAt),
  }
}

/**
 * The table of contents, keeping only lines that say something.
 *
 * An entry with no title is a row an editor added and never filled in. It is
 * dropped rather than rendered as an empty line with a page number beside it.
 */
export function toContents(value: unknown): ContentsEntry[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((row): ContentsEntry[] => {
    const entry = (row ?? {}) as Record<string, unknown>
    const title = text(entry.title)
    if (!title) return []
    return [
      { section: text(entry.section), title, page: pageNumber(entry.page) },
    ]
  })
}

/**
 * Entries grouped under their headings, in issue order.
 *
 * Only *consecutive* entries share a group. A magazine can return to a section
 * — Materials, then Practice, then Materials again — and merging the two runs
 * would reorder the issue into something that is not its contents.
 */
export function groupContents(entries: ContentsEntry[]): ContentsSection[] {
  const sections: ContentsSection[] = []
  for (const entry of entries) {
    const current = sections.at(-1)
    if (current && current.section === entry.section) {
      current.entries.push(entry)
    } else {
      sections.push({ section: entry.section, entries: [entry] })
    }
  }
  return sections
}

/** The issue as its landing page shows it, or null when it has no address. */
export function toPublicationDetail(
  doc: RawPublication | null | undefined,
): PublicationDetail | null {
  const card = toPublicationCard(doc)
  if (!doc || !card) return null

  return {
    ...card,
    contents: toContents(doc.contents),
    // The stored defaults, applied again here for a document written before
    // the fields existed or by something that skipped them.
    readingDirection: doc.readingDirection === 'rtl' ? 'rtl' : 'ltr',
    firstPageIsCover: doc.firstPageIsCover !== false,
    metaTitle: optionalText(doc.metaTitle),
    metaDescription: optionalText(doc.metaDescription),
    updatedAt: optionalText(doc.updatedAt),
  }
}
