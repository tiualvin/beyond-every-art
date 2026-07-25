import Image from 'next/image'
import Link from 'next/link'

import type { PostCard } from '@/lib/content/queries'
import { formatDate } from '@/lib/format'
import { postPath } from '@/lib/seo/site'

// The grid is `auto-fill, minmax(16rem, 1fr)` inside a 72rem container, so a
// card is roughly the full viewport on phones, half on tablets, and never much
// wider than 22rem on desktop.
const THUMB_SIZES = '(max-width: 40rem) 100vw, (max-width: 64rem) 50vw, 22rem'

/**
 * One story in a card grid: thumbnail, taxonomy label, title, excerpt, date.
 * Shared by the homepage and every archive so the two cannot drift apart.
 */
export function StoryCard({ post }: { post: PostCard }) {
  const href = postPath(post.slug)

  return (
    <article className="story-card">
      {/* The title link below has the same destination and accessible name, so
          this one is hidden from assistive technology and skipped by the tab
          order rather than announced as a second, identical link. */}
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
            sizes={THUMB_SIZES}
            className="story-card__image"
          />
        )}
      </Link>
      {post.tag && <p className="eyebrow">{post.tag}</p>}
      <h3>
        <Link href={href}>{post.title}</Link>
      </h3>
      {post.excerpt && <p className="story-card__excerpt">{post.excerpt}</p>}
      <p className="story-card__meta">{formatDate(post.publishedAt)}</p>
    </article>
  )
}
