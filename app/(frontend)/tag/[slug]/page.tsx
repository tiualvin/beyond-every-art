import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { getPostsByTag } from '@/lib/content/queries'
import { logMissingRoute } from '@/lib/observability/missing-route'
import { absoluteUrl, getSiteUrl, tagPath } from '@/lib/seo/site'

import { PostList } from '../../components/post-list'

export const dynamic = 'force-dynamic'

type Params = { slug: string }

const resolve = cache((slug: string) => getPostsByTag(slug))

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  const archive = await resolve(slug)
  if (!archive) return { title: 'Not found' }
  const canonical = absoluteUrl(tagPath(archive.slug), getSiteUrl())
  return {
    title: archive.name,
    description: archive.description || undefined,
    alternates: { canonical },
    openGraph: { type: 'website', title: archive.name, url: canonical },
  }
}

export default async function TagPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const archive = await resolve(slug)
  if (!archive) {
    await logMissingRoute(tagPath(slug))
    notFound()
  }

  return (
    <main>
      <section className="section">
        <div className="container">
          <div className="archive__head">
            <p className="eyebrow">Tag</p>
            <h1>{archive.name}</h1>
            {archive.description && (
              <p className="muted" style={{ maxWidth: '40rem' }}>
                {archive.description}
              </p>
            )}
          </div>
          <PostList posts={archive.posts} />
        </div>
      </section>
    </main>
  )
}
