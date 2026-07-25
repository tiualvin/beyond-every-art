import type { PostCard } from '@/lib/content/queries'

import { StoryCard } from './story-card'

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
        <StoryCard key={post.id} post={post} />
      ))}
    </div>
  )
}
