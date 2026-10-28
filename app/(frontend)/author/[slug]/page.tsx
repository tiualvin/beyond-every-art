import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import {
  archivePagePath,
  buildPagination,
  parsePageParam,
} from '@/lib/content/pagination'
import { getPostsByAuthor, getSiteSettings } from '@/lib/content/queries'
import { logMissingRoute } from '@/lib/observability/missing-route'
import {
  recordSlugMiss,
  requireLookupableSlug,
} from '@/lib/security/slug-requests'
import { buildProfilePageJsonLd, serializeJsonLd } from '@/lib/seo/jsonld'
import { absoluteUrl, authorPath, getSiteUrl } from '@/lib/seo/site'

import { ArchivePagination } from '../../components/archive-pagination'
import { FadeIn } from '../../components/motion/fade-in'
import { StaggerChildren, StaggerItem } from '../../components/motion/stagger'
import { StoryCard } from '../../components/story-card'

// Rendered per request so canonical URLs, feeds and JSON-LD come from the
// running container's environment rather than the build's; the database reads
// behind it are cached and purged on publish (lib/cache/content.ts).
export const dynamic = 'force-dynamic'

type Params = { slug: string }
type SearchParams = Promise<Record<string, string | string[] | undefined>>

// Resolved once per request, and gated first: a slug that cannot name an
// author is answered 404 without a query. See `lib/security/slug-requests.ts`.
const resolve = cache(async (slug: string, page: number) => {
  await requireLookupableSlug(slug)
  const archive = await getPostsByAuthor(slug, page)
  if (!archive) await recordSlugMiss()
  return archive
})

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: SearchParams
}): Promise<Metadata> {
  const { slug } = await params
  const archive = await resolve(slug, parsePageParam((await searchParams).page))
  if (!archive) return { title: 'Not found' }
  // Self-canonical per page, for the reason the tag archive gives.
  const canonical = absoluteUrl(
    archivePagePath(authorPath(archive.slug), archive.page),
    getSiteUrl(),
  )
  return {
    title:
      archive.page > 1
        ? `${archive.name} — Page ${archive.page}`
        : archive.name,
    description: archive.description || undefined,
    alternates: { canonical },
    openGraph: { type: 'profile', title: archive.name, url: canonical },
  }
}

export default async function AuthorPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: SearchParams
}) {
  const { slug } = await params
  const requested = parsePageParam((await searchParams).page)
  const archive = await resolve(slug, requested)
  if (!archive) {
    await logMissingRoute(authorPath(slug))
    notFound()
  }
  if (requested > 1 && requested > archive.totalPages) notFound()

  const pagination = buildPagination({
    basePath: authorPath(archive.slug),
    page: archive.page,
    totalPages: archive.totalPages,
  })

  // Ghost emitted a bare Person here; this wraps it as the mainEntity of a
  // ProfilePage, which is what the page actually is. See `lib/seo/jsonld.ts`.
  const settings = await getSiteSettings()
  const siteUrl = getSiteUrl()
  const jsonLd = serializeJsonLd(
    buildProfilePageJsonLd({
      url: absoluteUrl(authorPath(archive.slug), siteUrl),
      name: archive.name,
      description: archive.description || undefined,
      siteName: settings.title,
      siteUrl,
    }),
  )

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <section className="section">
        <div className="container">
          <FadeIn>
            <div className="archive__head">
              <p className="eyebrow">Author</p>
              <h1>{archive.name}</h1>
              {archive.description && (
                <p className="muted" style={{ maxWidth: '42rem' }}>
                  {archive.description}
                </p>
              )}
            </div>
          </FadeIn>
          <StaggerChildren className="card-grid">
            {archive.posts.map((post) => (
              <StaggerItem key={post.id}>
                <StoryCard post={post} />
              </StaggerItem>
            ))}
          </StaggerChildren>
          <ArchivePagination
            pagination={pagination}
            label={`Pages of pieces by ${archive.name}`}
          />
        </div>
      </section>
    </main>
  )
}
