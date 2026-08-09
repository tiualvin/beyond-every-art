import Image from 'next/image'
import Link from 'next/link'

import type { PostCard } from '@/lib/content/queries'
import { formatDate } from '@/lib/format'
import { postPath } from '@/lib/seo/site'

const THUMB_SIZES_DEFAULT =
  '(max-width: 40rem) 100vw, (max-width: 64rem) 50vw, 22rem'
const THUMB_SIZES_FEATURE =
  '(max-width: 40rem) 100vw, (max-width: 64rem) 60vw, 36rem'

export function StoryCard({
  post,
  variant = 'default',
}: {
  post: PostCard
  variant?: 'default' | 'feature'
}) {
  const href = postPath(post.slug)
  const isFeature = variant === 'feature'

  return (
    <article className={`story-card ${isFeature ? 'story-card--feature' : ''}`}>
      <Link
        href={href}
        className="story-card__thumb"
        aria-hidden="true"
        tabIndex={-1}
      >
        {post.image && (
          <Image
            src={post.image.url}
            alt={post.image.alt}
            fill
            sizes={isFeature ? THUMB_SIZES_FEATURE : THUMB_SIZES_DEFAULT}
            className="story-card__image"
          />
        )}
      </Link>
      {post.tag && <p className="eyebrow">{post.tag}</p>}
      <h3>
        <Link href={href}>{post.title}</Link>
      </h3>
      {isFeature && post.excerpt && (
        <p className="story-card__excerpt">{post.excerpt}</p>
      )}
      <p className="story-card__meta">
        {[
          post.authors.map((a) => a.name).join(', '),
          `${post.readingTime} min read`,
          formatDate(post.publishedAt),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </article>
  )
}
