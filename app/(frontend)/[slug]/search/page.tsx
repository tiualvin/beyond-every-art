import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { getPublishedPosts, searchPosts } from '@/lib/content/queries'
import { dictionaryFor } from '@/lib/i18n/dictionaries'
import { isPrefixedLocale, type Locale } from '@/lib/i18n/locales'
import { clientKey } from '@/lib/security/rate-limit'
import { searchPageLimiter } from '@/lib/security/search-limit'
import { robotsDirective } from '@/lib/seo/indexing'
import { absoluteUrl, getSiteUrl, localeSearchPath } from '@/lib/seo/site'

import { FadeIn } from '../../components/motion/fade-in'
import { PostList } from '../../components/post-list'

// Search within one translated language: `/{locale}/search/?q=`. Finds only
// that language's live translations, by their translated title and standfirst.
// A results page is noindex, as English's is.
//
// A 404 while the language has nothing live, like its home page: otherwise
// `/de/search/` is an indexable, self-canonical German page on a site with no
// German in it. `e2e/localization.spec.ts` checks every prefixed URL.
export const dynamic = 'force-dynamic'

type Params = { slug: string }
type SearchParams = { q?: string }

/** The language, when it is one with something live to search. */
async function searchableLocale(slug: string): Promise<Locale | null> {
  if (!isPrefixedLocale(slug)) return null
  const live = await getPublishedPosts({ page: 1, locale: slug })
  return live.totalPosts > 0 ? slug : null
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const locale = await searchableLocale((await params).slug)
  if (!locale) return { title: 'Not found' }
  const t = dictionaryFor(locale).search
  const query = (await searchParams).q?.trim()
  return {
    title: query ? `${t.title}: ${query}` : t.title,
    alternates: {
      canonical: absoluteUrl(localeSearchPath(locale), getSiteUrl()),
    },
    robots: robotsDirective(Boolean(query)),
  }
}

export default async function TranslatedSearchPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<SearchParams>
}) {
  const locale = await searchableLocale((await params).slug)
  if (!locale) notFound()
  const t = dictionaryFor(locale).search
  const query = (await searchParams).q?.trim() ?? ''
  const throttled =
    query.length > 0 &&
    !searchPageLimiter.check(clientKey(await headers())).allowed
  const posts = query && !throttled ? await searchPosts(query, 20, locale) : []

  return (
    <main>
      <section className="section">
        <div className="container">
          <FadeIn>
            <div className="archive__head">
              <p className="eyebrow">{t.title}</p>
              <h1>{query ? t.resultsFor(query) : t.label}</h1>
              <form
                className="search-form"
                action={localeSearchPath(locale)}
                role="search"
              >
                <input
                  className="search-form__input"
                  type="search"
                  name="q"
                  defaultValue={query}
                  placeholder={t.label}
                  aria-label={t.label}
                />
                <button className="button button--primary" type="submit">
                  {t.button}
                </button>
              </form>
            </div>
          </FadeIn>
          {throttled ? (
            <p className="muted">{t.throttled}</p>
          ) : query ? (
            posts.length > 0 ? (
              <PostList posts={posts} />
            ) : (
              <p className="muted">{t.none(query)}</p>
            )
          ) : (
            <p className="muted">{t.prompt}</p>
          )}
        </div>
      </section>
    </main>
  )
}
