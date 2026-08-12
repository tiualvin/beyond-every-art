import type { PostCard } from '@/lib/content/queries'

import { EntryRow } from './entry-row'

const MONTH = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** The month a post belongs to, or the bucket for posts without a date. */
function monthOf(post: PostCard): string {
  if (!post.publishedAt) return 'Undated'
  const date = new Date(post.publishedAt)
  return Number.isNaN(date.getTime()) ? 'Undated' : MONTH.format(date)
}

export type PostGroup = { label: string; posts: PostCard[] }

/**
 * Posts split into consecutive months.
 *
 * The input is already sorted newest first, so this walks it once and starts a
 * group whenever the month changes; it never sorts, because the sort order is
 * the query's business and re-deriving it here would let the two disagree.
 */
export function groupByMonth(posts: PostCard[]): PostGroup[] {
  const groups: PostGroup[] = []
  for (const post of posts) {
    const label = monthOf(post)
    const last = groups[groups.length - 1]
    if (last?.label === label) last.posts.push(post)
    else groups.push({ label, posts: [post] })
  }
  return groups
}

/**
 * The archive list: entries under a sticky date rail.
 *
 * When something was published is an archive's one organising fact, so the
 * month carries the structure rather than a card grid that only implies order.
 */
export function ArchiveGroups({ posts }: { posts: PostCard[] }) {
  return (
    <>
      {groupByMonth(posts).map((group) => (
        <section className="group" key={group.label}>
          <h2 className="group__label">{group.label}</h2>
          <div className="group__items">
            {group.posts.map((post) => (
              <EntryRow key={post.id} post={post} />
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
