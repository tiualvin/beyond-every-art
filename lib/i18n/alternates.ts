// Which articles, tags and authors are on the site in which language.
//
// One read answers every question that crosses languages: what a page's
// language switcher and hreflang list, which English links in a Spanish body
// can be pointed at the Spanish article, which tag and author archives exist
// in a language, and what each language's sitemap holds. Answering all of
// them from the same rows is what keeps them reciprocal — a Spanish page
// cannot claim an English twin whose page does not claim it back, because both
// are built from this.
//
// "Live in a language" is the site's own rule: for English `live()`, for a
// translation that plus its own status and date (`liveIn`). A translation of
// an article whose English is not live is not live either.

import { isScheduled } from '../content/schedule'
import {
  absoluteUrl,
  localeAuthorPath,
  localeHomePath,
  localePostPath,
  localeTagPath,
} from '../seo/site'
import {
  DEFAULT_LOCALE,
  LOCALE_CODES,
  localeOfPath,
  PREFIXED_LOCALES,
  type Locale,
} from './locales'

/** An article's address and dates in one language. */
export type LocalizedEntry = {
  slug: string
  /** When it was published in this language. */
  publishedAt: string | null
  /** When it last changed in this language — the sitemap's lastmod. */
  modifiedAt: string | null
}

export type PostLocales = {
  id: string
  noindex: boolean
  tagIds: string[]
  authorIds: string[]
  /** Only the languages it is live in; English first when it is. */
  locales: Partial<Record<Locale, LocalizedEntry>>
}

export type TagLocales = {
  id: string
  /** Only languages with a name, a slug and at least one live article. */
  locales: Partial<Record<Locale, { slug: string; name: string }>>
}

export type AuthorLocales = {
  id: string
  slug: string
  /** Languages with at least one live article by this author. */
  locales: Locale[]
}

export type LocaleIndex = {
  posts: PostLocales[]
  tags: TagLocales[]
  authors: AuthorLocales[]
}

export type ByLocale<T> = Partial<Record<string, T>> | T | null | undefined

/** A localized field read with `locale: 'all'`, in one language. */
export function pick<T>(value: ByLocale<T>, locale: Locale): T | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return (value as Record<string, T>)[locale]
  }
  return undefined
}

export const asString = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : null

export const ids = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((v) =>
          typeof v === 'object' && v !== null && 'id' in v
            ? (v as { id: unknown }).id
            : v,
        )
        .filter((v) => typeof v === 'number' || typeof v === 'string')
        .map(String)
    : []

/** Pure, for the tests: which languages a post read in every locale is live in. */
export function liveLocalesOf(
  doc: Record<string, unknown>,
  now: Date = new Date(),
): Partial<Record<Locale, LocalizedEntry>> {
  const locales: Partial<Record<Locale, LocalizedEntry>> = {}
  if (doc._status !== 'published') return locales
  if (isScheduled(doc._status, doc.publishedAt, now)) return locales

  const englishSlug = asString(
    pick(doc.slug as ByLocale<string>, DEFAULT_LOCALE),
  )
  if (!englishSlug) return locales
  locales[DEFAULT_LOCALE] = {
    slug: englishSlug,
    publishedAt: asString(doc.publishedAt),
    modifiedAt:
      asString(pick(doc.modifiedAt as ByLocale<string>, DEFAULT_LOCALE)) ??
      asString(doc.updatedAt),
  }

  for (const locale of PREFIXED_LOCALES) {
    if (
      pick(doc.translationStatus as ByLocale<string>, locale) !== 'published'
    ) {
      continue
    }
    const at = asString(
      pick(doc.translationPublishedAt as ByLocale<string>, locale),
    )
    if (!at || Date.parse(at) > now.getTime()) continue
    const slug = asString(pick(doc.slug as ByLocale<string>, locale))
    if (!slug) continue
    locales[locale] = {
      slug,
      publishedAt: at,
      modifiedAt:
        asString(pick(doc.modifiedAt as ByLocale<string>, locale)) ?? at,
    }
  }
  return locales
}

/** A page's address in each language it exists in, keyed by locale. */
export type Alternates = Partial<Record<Locale, string>>

/**
 * Only a page published in two or more languages has alternates. Below that
 * the answer is null and nothing is rendered: no switcher, no hreflang — which
 * is what keeps an untranslated English page byte-identical to what it was.
 */
export function atLeastTwo(alternates: Alternates): Alternates | null {
  return Object.keys(alternates).length >= 2 ? alternates : null
}

/** Order every list of languages the same way: the registry's order. */
export function ordered(alternates: Alternates): Array<[Locale, string]> {
  return LOCALE_CODES.flatMap((code) =>
    alternates[code] ? [[code, alternates[code]!] as [Locale, string]] : [],
  )
}

/**
 * The English slug → translated slug map for one language: what a link in a
 * translated body is rewritten through, and what related-article cards use.
 */
export function translatedSlugs(
  index: LocaleIndex,
  locale: Locale,
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const post of index.posts) {
    const english = post.locales[DEFAULT_LOCALE]?.slug
    const translated = post.locales[locale]?.slug
    if (english && translated) map[english] = translated
  }
  return map
}

/** An article's address in every language it is live in. */
export function postAlternates(
  index: LocaleIndex,
  match: (post: PostLocales) => boolean,
): Alternates | null {
  const post = index.posts.find(match)
  if (!post) return null
  const alternates: Alternates = {}
  for (const [locale, entry] of Object.entries(post.locales) as Array<
    [Locale, LocalizedEntry]
  >) {
    alternates[locale] = localePostPath(entry.slug, locale)
  }
  return atLeastTwo(alternates)
}

/**
 * A page's alternates, worked out from its own path — so the masthead, which
 * the layout renders without knowing what page is under it, and the page's
 * hreflang, which the page renders, ask the same function the same question.
 */
export function alternatesForPath(
  index: LocaleIndex,
  pathname: string,
): Alternates | null {
  const segments = pathname.split('/').filter(Boolean)
  const locale = localeOfPath(pathname)
  const rest = locale === DEFAULT_LOCALE ? segments : segments.slice(1)

  // A language's home page: `/` and `/es/`. Each exists once that language
  // has an article live in it.
  if (rest.length === 0) {
    const alternates: Alternates = {}
    for (const code of LOCALE_CODES) {
      if (index.posts.some((post) => post.locales[code])) {
        alternates[code] = localeHomePath(code)
      }
    }
    return alternates[locale] ? atLeastTwo(alternates) : null
  }

  if (rest.length === 1) {
    const slug = rest[0]!
    return postAlternates(index, (post) => post.locales[locale]?.slug === slug)
  }

  if (rest.length === 2 && rest[0] === 'tag') {
    const tag = index.tags.find((t) => t.locales[locale]?.slug === rest[1])
    if (!tag) return null
    const alternates: Alternates = {}
    for (const [code, value] of Object.entries(tag.locales) as Array<
      [Locale, { slug: string }]
    >) {
      alternates[code] = localeTagPath(value.slug, code)
    }
    return atLeastTwo(alternates)
  }

  if (rest.length === 2 && rest[0] === 'author') {
    const author = index.authors.find((a) => a.slug === rest[1])
    if (!author || !author.locales.includes(locale)) return null
    const alternates: Alternates = {}
    for (const code of author.locales) {
      alternates[code] = localeAuthorPath(author.slug, code)
    }
    return atLeastTwo(alternates)
  }

  return null
}

/**
 * `<link rel="alternate" hreflang>` for every language the page is in, plus
 * `x-default` at the English URL — absolute, and the same set on every
 * version, which is what makes it reciprocal. Undefined below two languages.
 */
export function hreflangFor(
  alternates: Alternates | null,
  siteUrl: string,
): Record<string, string> | undefined {
  if (!alternates) return undefined
  const languages: Record<string, string> = {}
  for (const [code, path] of ordered(alternates)) {
    languages[code] = absoluteUrl(path, siteUrl)
  }
  const english = alternates[DEFAULT_LOCALE]
  if (english) languages['x-default'] = absoluteUrl(english, siteUrl)
  return languages
}
