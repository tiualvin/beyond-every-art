import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import {
  getPageBySlug,
  getPostBySlug,
  getSiteSettings,
  type PageDetail,
  type PostDetail,
} from '@/lib/content/queries'
import { logMissingRoute } from '@/lib/observability/missing-route'
import { getPreviewMode } from '@/lib/preview/mode'
import { buildArticleJsonLd, serializeJsonLd } from '@/lib/seo/jsonld'
import { absoluteUrl, getSiteUrl, pagePath, postPath } from '@/lib/seo/site'

import { Article } from '../components/article'

export const dynamic = 'force-dynamic'

type Params = { slug: string }

type Resolved =
  | { kind: 'post'; post: PostDetail }
  | { kind: 'page'; page: PageDetail }
  | { kind: 'none' }

// Resolve once per request; generateMetadata and the page component share it.
const resolve = cache(async (slug: string): Promise<Resolved> => {
  const { draft, user } = await getPreviewMode()
  const post = await getPostBySlug(slug, { draft, user })
  if (post) return { kind: 'post', post }
  const page = await getPageBySlug(slug, { draft, user })
  if (page) return { kind: 'page', page }
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
    }
  }

  const { post } = resolved
  const canonical =
    post.canonicalURL || absoluteUrl(postPath(post.slug), siteUrl)
  const description = post.metaDescription || post.excerpt || undefined
  // Ghost emitted og:image for every post with a featured image; sharing cards
  // stay intact after the migration only if this one does too.
  const images = post.image
    ? [{ url: absoluteUrl(post.image.url, siteUrl), alt: post.image.alt }]
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
            {page.bodyHtml ? (
              <div
                className="prose"
                dangerouslySetInnerHTML={{ __html: page.bodyHtml }}
              />
            ) : (
              <p className="muted">This page has no content yet.</p>
            )}
          </div>
        </article>
      </main>
    )
  }

  const { post } = resolved
  const settings = await getSiteSettings()
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
      <Article post={post} />
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
