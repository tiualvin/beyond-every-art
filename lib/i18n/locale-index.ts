// The cached read behind `lib/i18n/alternates.ts`: which articles, tags and
// authors are live in which language. Kept apart from the pure functions there
// so those — and the sitemap builder, which uses them — stay testable without a
// database or a Next.js cache.

import { cachedRead, CONTENT_TAGS } from '../cache/content'
import { getPayloadClient } from '../payload'
import {
  asString,
  type AuthorLocales,
  type ByLocale,
  ids,
  liveLocalesOf,
  type LocaleIndex,
  pick,
  type PostLocales,
  type TagLocales,
} from './alternates'
import { LOCALE_CODES, type Locale } from './locales'

async function readLocaleIndex(): Promise<LocaleIndex> {
  try {
    const payload = await getPayloadClient()
    const now = new Date()
    const [posts, tags, authors] = await Promise.all([
      payload.find({
        collection: 'posts',
        overrideAccess: true,
        depth: 0,
        locale: 'all',
        pagination: false,
        limit: 0,
        // English must be live for any language to be: the cheap half of the
        // rule goes in the query, the per-language half in `liveLocalesOf`.
        where: { _status: { equals: 'published' } },
        select: {
          slug: true,
          _status: true,
          publishedAt: true,
          updatedAt: true,
          modifiedAt: true,
          translationStatus: true,
          translationPublishedAt: true,
          noindex: true,
          tags: true,
          authors: true,
        },
      }),
      payload.find({
        collection: 'tags',
        overrideAccess: true,
        depth: 0,
        locale: 'all',
        pagination: false,
        limit: 0,
        select: { slug: true, name: true },
      }),
      payload.find({
        collection: 'authors',
        overrideAccess: true,
        depth: 0,
        pagination: false,
        limit: 0,
        select: { slug: true },
      }),
    ])

    const postRows: PostLocales[] = (
      posts.docs as unknown as Array<Record<string, unknown>>
    )
      .map((doc) => ({
        id: String(doc.id),
        noindex: Boolean(doc.noindex),
        tagIds: ids(doc.tags),
        authorIds: ids(doc.authors),
        locales: liveLocalesOf(doc, now),
      }))
      .filter((row) => Object.keys(row.locales).length > 0)

    const liveWithTag = (tagId: string, locale: Locale) =>
      postRows.some((p) => p.locales[locale] && p.tagIds.includes(tagId))
    const liveByAuthor = (authorId: string, locale: Locale) =>
      postRows.some((p) => p.locales[locale] && p.authorIds.includes(authorId))

    const tagRows: TagLocales[] = (
      tags.docs as unknown as Array<Record<string, unknown>>
    ).map((doc) => {
      const id = String(doc.id)
      const locales: TagLocales['locales'] = {}
      for (const locale of LOCALE_CODES) {
        const slug = asString(pick(doc.slug as ByLocale<string>, locale))
        const name = asString(pick(doc.name as ByLocale<string>, locale))
        if (slug && name && liveWithTag(id, locale)) {
          locales[locale] = { slug, name }
        }
      }
      return { id, locales }
    })

    const authorRows: AuthorLocales[] = (
      authors.docs as unknown as Array<Record<string, unknown>>
    )
      .filter((doc) => asString(doc.slug))
      .map((doc) => {
        const id = String(doc.id)
        return {
          id,
          slug: String(doc.slug),
          locales: LOCALE_CODES.filter((locale) => liveByAuthor(id, locale)),
        }
      })

    return { posts: postRows, tags: tagRows, authors: authorRows }
  } catch {
    // Fails empty, which is the state of a site with no translations: every
    // switcher hides, no hreflang is emitted, and English is untouched.
    return { posts: [], tags: [], authors: [] }
  }
}

export const getLocaleIndex = cachedRead('locale-index', readLocaleIndex, [
  CONTENT_TAGS.posts,
  CONTENT_TAGS.tags,
  CONTENT_TAGS.authors,
])
