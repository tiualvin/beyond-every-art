import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { getPostsByAuthor } from '@/lib/content/queries'
import { logMissingRoute } from '@/lib/observability/missing-route'
import {
  recordSlugMiss,
  requireLookupableSlug,
} from '@/lib/security/slug-requests'
import { absoluteUrl, authorPath, getSiteUrl } from '@/lib/seo/site'

import { FadeIn } from '../../components/motion/fade-in'
import { StaggerChildren, StaggerItem } from '../../components/motion/stagger'
import { StoryCard } from '../../components/story-card'

// Rendered per request so canonical URLs, feeds and JSON-LD come from the
// running container's environment rather than the build's; the database reads
// behind it are cached and purged on publish (lib/cache/content.ts).
export const dynamic = 'force-dynamic'

type Params = { slug: string }

// Resolved once per request, and gated first: a slug that cannot name an
// author is answered 404 without a query. See `lib/security/slug-requests.ts`.
const resolve = cache(async (slug: string) => {
  await requireLookupableSlug(slug)
  const archive = await getPostsByAuthor(slug)
  if (!archive) await recordSlugMiss()
  return archive
})

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  const archive = await resolve(slug)
  if (!archive) return { title: 'Not found' }
  const canonical = absoluteUrl(authorPath(archive.slug), getSiteUrl())
  return {
    title: archive.name,
    description: archive.description || undefined,
    alternates: { canonical },
    openGraph: { type: 'profile', title: archive.name, url: canonical },
  }
}

export default async function AuthorPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug } = await params
  const archive = await resolve(slug)
  if (!archive) {
    await logMissingRoute(authorPath(slug))
    notFound()
  }

  return (
    <main>
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
        </div>
      </section>
    </main>
  )
}
