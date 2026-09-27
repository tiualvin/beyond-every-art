import { Fragment } from 'react'

import type { PostCard } from '@/lib/content/queries'

import { AdUnit } from './ad-unit'
import { EntryRow } from './entry-row'

/**
 * How many entries between listing units.
 *
 * Six, because the unit is a billboard and the row is a line of text: it is a
 * break in the list rather than another row, and putting one in every few
 * entries would read as the list failing to load. It is also the count §8
 * planned, so the reservation and the rule agree.
 */
const INLINE_EVERY = 6

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
export function ArchiveGroups({
  posts,
  adClient = null,
}: {
  posts: PostCard[]
  /**
   * The publisher to run listing units for, or null for none.
   *
   * Passed in rather than resolved here because the same list renders inside
   * `ArchiveFilter`, which is a client component and cannot read the server's
   * environment — see `lib/ads/eligibility.ts`. Null on a deployment that must
   * not serve ad code, which is the ordinary state of staging.
   */
  adClient?: string | null
}) {
  // One running count across the whole list, not one per month group: the
  // unit's job is to break the reading of the list, and a piece low in a short
  // month should not go unbroken because the group restarted the count.
  let seen = 0

  return (
    <>
      {groupByMonth(posts).map((group) => (
        <section className="group" key={group.label}>
          <h2 className="group__label">{group.label}</h2>
          <div className="group__items">
            {group.posts.map((post) => {
              seen += 1
              return (
                <Fragment key={post.id}>
                  <EntryRow post={post} />
                  {adClient && seen % INLINE_EVERY === 0 && (
                    <AdUnit placement="archive-inline" client={adClient} />
                  )}
                </Fragment>
              )
            })}
          </div>
        </section>
      ))}
    </>
  )
}
