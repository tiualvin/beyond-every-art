import Link from 'next/link'

import type { PostCard } from '@/lib/content/queries'
import { formatDate } from '@/lib/format'
import { postPath } from '@/lib/seo/site'

export function PostList({ posts }: { posts: PostCard[] }) {
  if (posts.length === 0) {
    return (
      <p className="muted" style={{ textAlign: 'center' }}>
        No stories here yet.
      </p>
    )
  }

  return (
    <div className="card-grid">
      {posts.map((post) => (
        <article key={post.id} className="story-card">
          <Link href={postPath(post.slug)} aria-label={post.title}>
            <span className="story-card__thumb" />
          </Link>
          {post.tag && <p className="eyebrow">{post.tag}</p>}
          <h3>
            <Link href={postPath(post.slug)}>{post.title}</Link>
          </h3>
          {post.excerpt && (
            <p className="story-card__excerpt">{post.excerpt}</p>
          )}
          <p className="story-card__meta">{formatDate(post.publishedAt)}</p>
        </article>
      ))}
    </div>
  )
}
