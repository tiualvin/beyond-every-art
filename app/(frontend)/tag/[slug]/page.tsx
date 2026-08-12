import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { getPostsByTag, getTagsWithCounts } from '@/lib/content/queries'
import { pigmentFor } from '@/lib/design/pigments'
import { logMissingRoute } from '@/lib/observability/missing-route'
import { absoluteUrl, getSiteUrl, JOURNAL_PATH, tagPath } from '@/lib/seo/site'

import { ArchiveGroups } from '../../components/archive-groups'
import { FadeIn } from '../../components/motion/fade-in'

// Rendered per request so canonical URLs, feeds and JSON-LD come from the
// running container's environment rather than the build's; the database reads
// behind it are cached and purged on publish (lib/cache/content.ts).
export const dynamic = 'force-dynamic'

type Params = { slug: string }

/** Enough to move on with, without turning the foot into a second archive. */
const SIBLING_TOPICS = 5

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

  const siblings = (await getTagsWithCounts(SIBLING_TOPICS + 1))
    .filter((topic) => topic.slug !== archive.slug)
    .slice(0, SIBLING_TOPICS)

  const pigment = pigmentFor(archive.slug)

  return (
    <main>
      {/* The topic's own pigment stains the head, so arriving on a topic feels
          like arriving somewhere rather than landing on a filtered list. */}
      <header
        className="topic-head"
        style={{ '--pigment': pigment.hex } as React.CSSProperties}
      >
        <div className="topic-head__wash" aria-hidden="true" />
        <div className="topic-head__scrim" aria-hidden="true" />
        <div className="container">
          <p className="topic-head__crumb">
            <Link href={JOURNAL_PATH}>Journal</Link>
            <span aria-hidden="true">/</span>
            <span>Topics</span>
          </p>
          <FadeIn>
            <p className="topic-head__kicker">
              <span
                className="topic-head__swatch"
                style={{ background: pigment.hex }}
              />
              <span className="eyebrow">Topic</span>
            </p>
            <h1 className="archive__title">{archive.name}</h1>
            {archive.description && (
              <p className="archive__intro">{archive.description}</p>
            )}
          </FadeIn>
        </div>
      </header>

      <section className="archive">
        <div className="container">
          {archive.posts.length > 0 ? (
            <ArchiveGroups posts={archive.posts} />
          ) : (
            <p className="archive__empty">
              Nothing filed under this topic yet.
            </p>
          )}
        </div>
      </section>

      {siblings.length > 0 && (
        <section className="related">
          <div className="container">
            <p className="related__label">Related topics</p>
            <div className="related__list">
              {siblings.map((topic) => (
                <Link
                  key={topic.slug}
                  href={tagPath(topic.slug)}
                  className="chip"
                >
                  <i style={{ background: pigmentFor(topic.slug).hex }} />
                  {topic.name}
                  <span className="chip__count">{topic.postCount}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
