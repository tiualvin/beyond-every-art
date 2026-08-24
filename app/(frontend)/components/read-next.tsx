import Image from 'next/image'
import Link from 'next/link'

import type { PostCard } from '@/lib/content/queries'
import { formatDate } from '@/lib/format'
import { visibilityLabel } from '@/lib/membership'
import { postPath } from '@/lib/seo/site'

import { Reveal } from './motion/reveal'
import { thumbnailSrc } from '@/lib/content/media'

const PLATE_SIZES = '(max-width: 46rem) 100vw, (max-width: 64rem) 50vw, 22rem'

/**
 * The three-up "Read next" that closes an article.
 *
 * The row is one `Reveal` rather than a staggered one per card because the
 * cards are laid out on a subgrid: a per-card wrapper would become the grid
 * child, and the plates, titles and meta lines would stop lining up with each
 * other — which is the whole reason the prototype uses subgrid here.
 */
export function ReadNext({
  posts,
  topic,
}: {
  posts: PostCard[]
  topic?: string | null
}) {
  if (posts.length === 0) return null

  return (
    <section className="read-next">
      <div className="container">
        <Reveal>
          <div className="read-next__head">
            <div>
              <p className="eyebrow">Read next</p>
              <h2>{topic ? `More on ${topic}` : 'More from the journal'}</h2>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="read-next__grid">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={postPath(post.slug)}
                className="read-next__item"
              >
                <div className="read-next__plate">
                  {post.image && (
                    <Image
                      src={thumbnailSrc(post.image)}
                      alt=""
                      fill
                      sizes={PLATE_SIZES}
                      style={{ objectFit: 'cover' }}
                    />
                  )}
                </div>
                <p className="eyebrow">{post.tags[0]?.name ?? 'Journal'}</p>
                <h3>{post.title}</h3>
                <p>{post.excerpt}</p>
                <p className="read-next__meta">
                  {[
                    visibilityLabel(post.visibility),
                    `${post.readingTime} min`,
                    formatDate(post.publishedAt),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </Link>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
