// One article page, in any language.
//
// Moved here from `[slug]/page.tsx` so the English route and the translated
// route (`[slug]/[localizedSlug]/page.tsx`) render the same thing the same
// way, and cannot drift on the SEO details that have to agree across them —
// canonical, hreflang, Open Graph locale, JSON-LD language.
//
// For an English article with no translation, `alternates` is null and the
// output is what the English route rendered before this file existed, byte
// for byte: no hreflang, no `og:locale`, no `inLanguage`, no switcher. The
// language extras appear only where there is a second language to point at.

import type { Metadata } from 'next'
import Link from 'next/link'

import { adClientFor } from '@/lib/ads/eligibility'
import { shareImageSrc } from '@/lib/content/media'
import {
  getRelatedPosts,
  getSiteSettings,
  type PostDetail,
} from '@/lib/content/queries'
import { RELATED_QUERY_LIMIT, splitRelated } from '@/lib/content/related'
import { hreflangFor, ordered, type Alternates } from '@/lib/i18n/alternates'
import { DEFAULT_LOCALE, localeConfig, type Locale } from '@/lib/i18n/locales'
import { collectBodyImages } from '@/lib/seo/body-images'
import { collectBlockJsonLd } from '@/lib/seo/block-jsonld'
import { robotsDirective } from '@/lib/seo/indexing'
import { buildArticleJsonLd, serializeJsonLd } from '@/lib/seo/jsonld'
import {
  absoluteUrl,
  getSiteUrl,
  localeAuthorPath,
  localePostPath,
} from '@/lib/seo/site'

import { AdUnit } from './components/ad-unit'
import { Article } from './components/article'
import { HouseBand } from './components/house-band'
import { ReadNext } from './components/read-next'

export { hreflangFor }

/** `og:locale` and `og:locale:alternate`, on a page in two or more languages. */
export function openGraphLocale(
  alternates: Alternates | null,
  locale: Locale,
): { locale?: string; alternateLocale?: string[] } {
  if (!alternates) return {}
  return {
    locale: localeConfig(locale).ogLocale,
    alternateLocale: ordered(alternates)
      .filter(([code]) => code !== locale)
      .map(([code]) => localeConfig(code).ogLocale),
  }
}

/** The address a post is canonical at: itself, in its own language. */
export function postCanonical(post: PostDetail, siteUrl: string): string {
  const locale = post.locale ?? DEFAULT_LOCALE
  // `canonicalURL` is null on a translation (`toPostDetail`): it names where
  // the English piece was first published, never this one.
  return (
    post.canonicalURL || absoluteUrl(localePostPath(post.slug, locale), siteUrl)
  )
}

export function postMetadata(
  post: PostDetail,
  alternates: Alternates | null,
): Metadata {
  const siteUrl = getSiteUrl()
  const locale = post.locale ?? DEFAULT_LOCALE
  const canonical = postCanonical(post, siteUrl)
  const description = post.metaDescription || post.excerpt || undefined
  // Ghost emitted og:image for every post with a featured image; sharing cards
  // stay intact after the migration only if this one does too.
  const images = post.image
    ? [
        {
          url: absoluteUrl(shareImageSrc(post.image), siteUrl),
          alt: post.image.alt,
        },
      ]
    : undefined
  const languages = hreflangFor(alternates, siteUrl)
  return {
    // Bare, as Ghost served it. Three of the 113 migrated posts carry a
    // hand-written ` | beyondeveryart` suffix of their own, which the layout's
    // template would have doubled.
    title: { absolute: post.metaTitle || post.title },
    description,
    alternates: languages ? { canonical, languages } : { canonical },
    openGraph: {
      type: 'article',
      title: post.title,
      description,
      url: canonical,
      ...openGraphLocale(alternates, locale),
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.modifiedAt ?? undefined,
      authors: post.authors.map((a) => a.name),
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description,
      images,
    },
    robots: robotsDirective(post.noindex),
  }
}

export async function PostView({
  post,
  alternates,
  showBanner,
  draft,
}: {
  post: PostDetail
  alternates: Alternates | null
  showBanner: boolean
  draft: boolean
}) {
  const locale = post.locale ?? DEFAULT_LOCALE
  const [settings, related] = await Promise.all([
    locale === DEFAULT_LOCALE ? getSiteSettings() : getSiteSettings(locale),
    // Nine: three for "Read next" and up to six for the house boxes in the
    // in-body ad slots. One query for both, divided below, so the two surfaces
    // cannot show a reader the same piece twice — `lib/content/related.ts`.
    // A translation ranks among its own language's translations, by tag id.
    locale === DEFAULT_LOCALE
      ? getRelatedPosts(
          post.slug,
          post.tags.map((tag) => tag.slug),
          RELATED_QUERY_LIMIT,
        )
      : getRelatedPosts(post.slug, post.tagIds, RELATED_QUERY_LIMIT, locale),
  ])
  const { readNext, inline: inlinePromos } = splitRelated(related)
  // The end-of-article unit's publisher. Same answer the body and rail take,
  // from the same predicate, so a restricted teaser carries none of the three.
  const adClient = adClientFor({ restricted: post.restricted })
  const siteUrl = getSiteUrl()
  const url = postCanonical(post, siteUrl)
  // Only a page in two or more languages says which one it is in: an English
  // article with no translation keeps the structured data it always had.
  const inLanguage = alternates ? locale : undefined

  const jsonLd = serializeJsonLd(
    buildArticleJsonLd({
      url,
      headline: post.title,
      description: post.metaDescription || post.excerpt || undefined,
      datePublished: post.publishedAt,
      dateModified: post.modifiedAt,
      authors: post.authors.map((a) => ({
        name: a.name,
        url: a.slug
          ? absoluteUrl(localeAuthorPath(a.slug, locale), siteUrl)
          : null,
        sameAs: a.website ? [a.website] : [],
      })),
      image: post.image ? absoluteUrl(post.image.url, siteUrl) : null,
      // The images inside the piece, so the Article node describes everything a
      // reader can see rather than only the thing at the top. Free here: the
      // body is already resolved. A gated post passes its teaser, so this
      // cannot describe a part of the piece the reader was not given.
      images: collectBodyImages(post.body, siteUrl),
      siteName: settings.title,
      siteUrl,
      isAccessibleForFree: !post.restricted,
      inLanguage,
    }),
  )

  // Separate <script> tags rather than one `@graph`. Both are valid and
  // crawlers merge them, and keeping the Article node byte-identical to what it
  // was means a block cannot change the shape of the thing that already ranks.
  // A translated FAQ is built from the translated block, so its questions are
  // in the page's language.
  const blockJsonLd = collectBlockJsonLd(post.body).map((node) =>
    inLanguage ? { ...node, inLanguage } : node,
  )

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      {blockJsonLd.map((node, index) => (
        <BlockJsonLd key={index} node={node} />
      ))}
      {showBanner && <DraftBanner />}
      <Article
        post={post}
        newsletterImage={settings.newsletterImage}
        railFallback={settings.railFallback}
        inlinePromos={inlinePromos}
        preview={draft}
        alternates={alternates}
      />
      {/* `article-end`: below the author card the article renders, above
          "Read next". The block and the container are the same width the
          billboard is sized against — docs/ADVERTISING.md §8. */}
      {adClient && (
        <div className="container">
          <AdUnit placement="article-end" client={adClient}>
            {settings.railFallback ? (
              <HouseBand
                fallback={settings.railFallback}
                {...(locale === DEFAULT_LOCALE ? {} : { locale })}
              />
            ) : undefined}
          </AdUnit>
        </div>
      )}
      <ReadNext
        posts={readNext}
        topic={post.tags[0]?.name}
        {...(locale === DEFAULT_LOCALE ? {} : { locale })}
      />
    </>
  )
}

/** One structured-data node contributed by a block in the body. */
export function BlockJsonLd({ node }: { node: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: serializeJsonLd({ '@context': 'https://schema.org', ...node }),
      }}
    />
  )
}

export function DraftBanner() {
  return (
    <div
      style={{
        background: '#111',
        color: '#fff',
        padding: '0.5rem 1rem',
        fontSize: '0.875rem',
        textAlign: 'center',
      }}
    >
      Draft preview —{' '}
      <Link href="/api/preview/exit" style={{ color: '#fff' }}>
        exit preview
      </Link>
    </div>
  )
}
