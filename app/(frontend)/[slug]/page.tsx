import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { parsePageParam } from '@/lib/content/pagination'
import {
  getPageBySlug,
  getPostBySlug,
  getPublishedPosts,
  getSiteSettings,
  type PageDetail,
  type PostDetail,
} from '@/lib/content/queries'
import { alternatesForPath } from '@/lib/i18n/alternates'
import { getLocaleIndex } from '@/lib/i18n/locale-index'
import { isPrefixedLocale, type Locale } from '@/lib/i18n/locales'
import { logMissingRoute } from '@/lib/observability/missing-route'
import { getPreviewMode } from '@/lib/preview/mode'
import {
  recordSlugMiss,
  requireLookupableSlug,
} from '@/lib/security/slug-requests'
import { collectBlockJsonLd } from '@/lib/seo/block-jsonld'
import { robotsDirective } from '@/lib/seo/indexing'
import { buildWebPageJsonLd, serializeJsonLd } from '@/lib/seo/jsonld'
import { absoluteUrl, getSiteUrl, pagePath, postPath } from '@/lib/seo/site'

import { FeaturedFigure } from '../components/article'
import { ArticleBody } from '../components/body'
import { LocaleHome, localeHomeMetadata } from '../locale-pages'
import { BlockJsonLd, DraftBanner, postMetadata, PostView } from '../post-view'

// Rendered per request so canonical URLs, feeds and JSON-LD come from the
// running container's environment rather than the build's; the database reads
// behind it are cached and purged on publish (lib/cache/content.ts).
export const dynamic = 'force-dynamic'

type Params = { slug: string }
type SearchParams = Promise<Record<string, string | string[] | undefined>>

type Resolved =
  | { kind: 'post'; post: PostDetail }
  | { kind: 'page'; page: PageDetail }
  | { kind: 'none' }

// Resolve once per request; generateMetadata and the page component share it.
//
// This is also where a slug that cannot resolve is turned away before it costs
// two queries and two cache entries — see `lib/security/slug-requests.ts`. It
// belongs here rather than in the two callers precisely because `cache()` makes
// it run once: `generateMetadata` and the page body get the same verdict.
const resolve = cache(async (slug: string): Promise<Resolved> => {
  // `/es/`, `/id/`, `/de/`: a language's home page, not an article. Every
  // locale code is a reserved slug, so no English post or page can be here.
  if (isPrefixedLocale(slug)) return { kind: 'none' }
  const { draft, user } = await getPreviewMode()
  // Preview is exempt. A draft save relaxes field validation, so an editor is
  // the one caller who can legitimately ask for a slug the pattern refuses.
  if (!draft) await requireLookupableSlug(slug)

  const post = await getPostBySlug(slug, { draft, user })
  if (post) return { kind: 'post', post }
  const page = await getPageBySlug(slug, { draft, user })
  if (page) return { kind: 'page', page }

  // Both reads missed, so this slug names nothing. Counted against the source
  // only now: a reader moving through real articles never reaches this line.
  if (!draft) await recordSlugMiss()
  return { kind: 'none' }
})

/**
 * A language's home page: its live articles, newest first. Null — and so a
 * 404 — while the language has none, or for a page past the last.
 */
const resolveLocaleHome = cache(async (locale: Locale, page: number) => {
  const archive = await getPublishedPosts({ page, locale })
  if (archive.totalPosts === 0) return null
  if (page > 1 && page > archive.totalPages) return null
  return archive
})

/** The English page's other languages, when it has any. */
async function alternatesFor(path: string) {
  return alternatesForPath(await getLocaleIndex(), path)
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: SearchParams
}): Promise<Metadata> {
  const { slug } = await params
  if (isPrefixedLocale(slug)) {
    const page = parsePageParam((await searchParams).page)
    const archive = await resolveLocaleHome(slug, page)
    if (!archive) return { title: 'Not found' }
    const settings = await getSiteSettings(slug)
    return localeHomeMetadata({
      locale: slug,
      archive,
      siteTitle: settings.title,
      description: settings.description,
    })
  }
  // The same gated check the page body uses, so a draft's title and
  // description cannot leak through metadata to a request that may not read it.
  const resolved = await resolve(slug)
  const siteUrl = getSiteUrl()

  if (resolved.kind === 'none') return { title: 'Not found' }

  if (resolved.kind === 'page') {
    const { page } = resolved
    const canonical =
      page.canonicalURL || absoluteUrl(pagePath(page.slug), siteUrl)
    return {
      // `absolute`, so the layout's ` - Beyond Every Art` suffix is not
      // appended: Ghost served page titles bare (`About this site`), and a
      // title the flip rewrites is a changed search result for every page.
      title: { absolute: page.metaTitle || page.title },
      description: page.metaDescription || undefined,
      alternates: { canonical },
      openGraph: { type: 'website', title: page.title, url: canonical },
      // Omitted entirely unless something asks for a restriction, so the
      // layout's deployment-wide switch is never overridden from here.
      robots: robotsDirective(page.noindex),
    }
  }

  const { post } = resolved
  return postMetadata(post, await alternatesFor(postPath(post.slug)))
}

export default async function SlugPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: SearchParams
}) {
  const { slug } = await params
  if (isPrefixedLocale(slug)) {
    const page = parsePageParam((await searchParams).page)
    const archive = await resolveLocaleHome(slug, page)
    if (!archive) notFound()
    const settings = await getSiteSettings(slug)
    return (
      <LocaleHome
        locale={slug}
        archive={archive}
        description={settings.description}
      />
    )
  }
  const { draft, live } = await getPreviewMode()
  const resolved = await resolve(slug)

  // Inside the Live Preview iframe the admin already frames the document, so
  // the banner would only steal space from the page being judged.
  const showBanner = draft && !live

  if (resolved.kind === 'none') {
    await logMissingRoute(postPath(slug))
    notFound()
  }

  if (resolved.kind === 'page') {
    const { page } = resolved
    // A page has no Article node — it is not an article — but it is a WebPage,
    // and its blocks still describe themselves. A landing page whose FAQ
    // answers the question a visitor searched is worth saying out loud even
    // when the page around it is not editorial.
    //
    // Ghost emitted `Article` here. Departing from that is deliberate and the
    // reasoning is in `lib/seo/jsonld.ts`: the crawl comparison reads this as a
    // difference, and it is the right difference to keep.
    const pageSettings = await getSiteSettings()
    const pageSiteUrl = getSiteUrl()
    const pageJsonLd = serializeJsonLd(
      buildWebPageJsonLd({
        url: page.canonicalURL || absoluteUrl(pagePath(page.slug), pageSiteUrl),
        name: page.title,
        description: page.metaDescription || undefined,
        dateModified: page.updatedAt,
        siteName: pageSettings.title,
        siteUrl: pageSiteUrl,
      }),
    )
    const pageBlockJsonLd = collectBlockJsonLd(page.body)
    return (
      <main>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: pageJsonLd }}
        />
        {pageBlockJsonLd.map((node, index) => (
          <BlockJsonLd key={index} node={node} />
        ))}
        {showBanner && <DraftBanner />}
        <article className="article">
          <div className="container article__inner">
            <header className="article__header">
              <h1>{page.title}</h1>
            </header>
            {/* Same wrapper class as the post template, for the same reason:
                the grid sizes this box, not the figure inside it. */}
            {page.image && (
              <div className="article__figure-frame">
                <FeaturedFigure image={page.image} />
              </div>
            )}
            <ArticleBody
              body={page.body}
              preview={draft}
              emptyMessage="This page has no content yet."
            />
          </div>
        </article>
      </main>
    )
  }

  const { post } = resolved
  return (
    <PostView
      post={post}
      alternates={await alternatesFor(postPath(post.slug))}
      showBanner={showBanner}
      draft={draft}
    />
  )
}
