// The pages a translated language has that are lists rather than articles:
// its home page (`/es/`) and its tag and author archives (`/es/tag/…/`,
// `/es/author/…/`).
//
// Deliberately plainer than English's. The English homepage, journal and tag
// pages are built around editors' picks, topic counts and a cover that exist
// in English only; a language with a handful of translations needs a list of
// them, in its own words, and nothing that would show a reader English text.
// Every one of them 404s when its language has nothing live in it — an empty
// archive is not a page worth a URL, and the sitemap never lists one.

import type { Metadata } from 'next'
import Link from 'next/link'

import { archivePagePath, buildPagination } from '@/lib/content/pagination'
import type { Archive, PostPage } from '@/lib/content/queries'
import type { Alternates } from '@/lib/i18n/alternates'
import { dictionaryFor } from '@/lib/i18n/dictionaries'
import type { Locale } from '@/lib/i18n/locales'
import { absoluteUrl, getSiteUrl, localeHomePath } from '@/lib/seo/site'

import { FadeIn } from './components/motion/fade-in'
import { PostList } from './components/post-list'
import { hreflangFor, openGraphLocale } from './post-view'

export function localeHomeMetadata({
  locale,
  archive,
  siteTitle,
  description,
}: {
  locale: Locale
  archive: PostPage
  siteTitle: string
  description: string
}): Metadata {
  const t = dictionaryFor(locale).home
  const siteUrl = getSiteUrl()
  const canonical = absoluteUrl(
    archivePagePath(localeHomePath(locale), archive.page),
    siteUrl,
  )
  const title =
    archive.page > 1
      ? `${t.title} — ${t.page(archive.page, archive.totalPages)}`
      : t.title
  // Self-canonical, and no hreflang: a language's home page lists the pieces
  // translated into it, which is not a translation of the English homepage.
  // The masthead's switcher still links the two.
  return {
    title: { absolute: `${title} - ${siteTitle}` },
    description: description || t.description,
    alternates: { canonical },
    openGraph: { type: 'website', title, url: canonical },
  }
}

export function LocaleHome({
  locale,
  archive,
  description,
}: {
  locale: Locale
  archive: PostPage
  description: string
}) {
  const t = dictionaryFor(locale).home
  const pagination = buildPagination({
    basePath: localeHomePath(locale),
    page: archive.page,
    totalPages: archive.totalPages,
  })

  return (
    <main>
      <section className="archive">
        <div className="container">
          <FadeIn>
            <div className="archive__head archive__head--wide">
              <p className="eyebrow">{t.eyebrow}</p>
              <h1 className="archive__title">{t.title}</h1>
              <p className="archive__intro">{description || t.description}</p>
            </div>
          </FadeIn>

          <PostList posts={archive.posts} />

          {pagination.totalPages > 1 && (
            <nav className="pagination" aria-label={t.latest}>
              {pagination.prevPath ? (
                <Link
                  href={pagination.prevPath}
                  className="button button--ghost"
                  rel="prev"
                >
                  {t.newer}
                </Link>
              ) : (
                <span />
              )}
              <p className="pagination__status">
                {t.page(pagination.page, pagination.totalPages)}
              </p>
              {pagination.nextPath ? (
                <Link
                  href={pagination.nextPath}
                  className="button button--ghost"
                  rel="next"
                >
                  {t.older}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </div>
      </section>
    </main>
  )
}

export function localeArchiveMetadata({
  locale,
  archive,
  path,
  alternates,
  siteTitle,
}: {
  locale: Locale
  archive: Archive
  path: string
  alternates: Alternates | null
  siteTitle: string
}): Metadata {
  const siteUrl = getSiteUrl()
  const canonical = absoluteUrl(path, siteUrl)
  const languages = hreflangFor(alternates, siteUrl)
  const title = archive.metaTitle || archive.name
  return {
    title: { absolute: `${title} - ${siteTitle}` },
    description: archive.metaDescription || archive.description || undefined,
    alternates: languages ? { canonical, languages } : { canonical },
    openGraph: {
      type: 'website',
      title,
      url: canonical,
      ...openGraphLocale(alternates, locale),
    },
  }
}

export function LocaleArchive({
  locale,
  archive,
  kind,
}: {
  locale: Locale
  archive: Archive
  kind: 'topic' | 'author'
}) {
  const t = dictionaryFor(locale).archive
  return (
    <main>
      <section className="archive">
        <div className="container">
          <FadeIn>
            <div className="archive__head archive__head--wide">
              <p className="eyebrow">{kind === 'topic' ? t.topic : t.author}</p>
              <h1 className="archive__title">{archive.name}</h1>
              {archive.description && (
                <p className="archive__intro">{archive.description}</p>
              )}
              <p className="muted">{t.count(archive.posts.length)}</p>
            </div>
          </FadeIn>
          <PostList posts={archive.posts} />
        </div>
      </section>
    </main>
  )
}
