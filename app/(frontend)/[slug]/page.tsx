import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import {
  getPageBySlug,
  getPostBySlug,
  getRelatedPosts,
  getSiteSettings,
  type PageDetail,
  type PostDetail,
} from '@/lib/content/queries'
import { shareImageSrc } from '@/lib/content/media'
import { logMissingRoute } from '@/lib/observability/missing-route'
import { getPreviewMode } from '@/lib/preview/mode'
import {
  recordSlugMiss,
  requireLookupableSlug,
} from '@/lib/security/slug-requests'
import { robotsDirective } from '@/lib/seo/indexing'
import { buildArticleJsonLd, serializeJsonLd } from '@/lib/seo/jsonld'
import { absoluteUrl, getSiteUrl, pagePath, postPath } from '@/lib/seo/site'

import { Article } from '../components/article'
import { ArticleBody } from '../components/body'
import { ReadNext } from '../components/read-next'

// Rendered per request so canonical URLs, feeds and JSON-LD come from the
// running container's environment rather than the build's; the database reads
// behind it are cached and purged on publish (lib/cache/content.ts).
export const dynamic = 'force-dynamic'

type Params = { slug: string }

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

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
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
      title: page.metaTitle || page.title,
      description: page.metaDescription || undefined,
      alternates: { canonical },
      openGraph: { type: 'website', title: page.title, url: canonical },
      // Omitted entirely unless something asks for a restriction, so the
      // layout's deployment-wide switch is never overridden from here.
      robots: robotsDirective(page.noindex),
    }
  }

  const { post } = resolved
  const canonical =
    post.canonicalURL || absoluteUrl(postPath(post.slug), siteUrl)
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
  return {
    title: post.metaTitle || post.title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'article',
      title: post.title,
      description,
      url: canonical,
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.updatedAt ?? undefined,
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

export default async function SlugPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug } = await params
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
    return (
      <main>
        {showBanner && <DraftBanner />}
        <article className="article">
          <div className="container article__inner">
            <header className="article__header">
              <h1>{page.title}</h1>
            </header>
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
  const [settings, related] = await Promise.all([
    getSiteSettings(),
    getRelatedPosts(
      post.slug,
      post.tags.map((tag) => tag.slug),
    ),
  ])
  const siteUrl = getSiteUrl()
  const url = post.canonicalURL || absoluteUrl(postPath(post.slug), siteUrl)

  const jsonLd = serializeJsonLd(
    buildArticleJsonLd({
      url,
      headline: post.title,
      description: post.metaDescription || post.excerpt || undefined,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt,
      authors: post.authors.map((a) => a.name),
      image: post.image ? absoluteUrl(post.image.url, siteUrl) : null,
      siteName: settings.title,
      siteUrl,
      isAccessibleForFree: !post.restricted,
    }),
  )

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      {showBanner && <DraftBanner />}
      <Article post={post} preview={draft} />
      <ReadNext posts={related} topic={post.tags[0]?.name} />
    </>
  )
}

function DraftBanner() {
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
