import Image from 'next/image'
import Link from 'next/link'

import type { PostCard } from '@/lib/content/queries'
import { formatDate } from '@/lib/format'
import { visibilityLabel } from '@/lib/membership'
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
  variant?: 'default' | 'feature' | 'horizontal'
}) {
  const href = postPath(post.slug)
  const showExcerpt = variant === 'feature' || variant === 'horizontal'
  const thumbSizes =
    variant === 'default' ? THUMB_SIZES_DEFAULT : THUMB_SIZES_FEATURE

  const thumb = (
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
          sizes={thumbSizes}
          className="story-card__image"
        />
      )}
    </Link>
  )

  const text = (
    <>
      {post.tags[0] && <p className="eyebrow">{post.tags[0].name}</p>}
      <h3>
        <Link href={href}>{post.title}</Link>
      </h3>
      {showExcerpt && post.excerpt && (
        <p className="story-card__excerpt">{post.excerpt}</p>
      )}
      <p className="story-card__meta">
        {[
          visibilityLabel(post.visibility),
          post.authors.map((a) => a.name).join(', '),
          `${post.readingTime} min read`,
          formatDate(post.publishedAt),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </>
  )

  const className = [
    'story-card',
    variant !== 'default' && `story-card--${variant}`,
  ]
    .filter(Boolean)
    .join(' ')

  if (variant === 'horizontal') {
    return (
      <article className={className}>
        {thumb}
        <div className="story-card__body">{text}</div>
      </article>
    )
  }

  return (
    <article className={className}>
      {thumb}
      {text}
    </article>
  )
}
