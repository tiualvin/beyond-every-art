import Image from 'next/image'
import Link from 'next/link'

import type { PostCard } from '@/lib/content/queries'
import { formatDate } from '@/lib/format'
import { visibilityLabel } from '@/lib/membership'
import { postPath } from '@/lib/seo/site'

const THUMB_SIZES = '(max-width: 51rem) 4rem, 5.5rem'

/**
 * One row of a story list: cover image, title, excerpt, tag, and date.
 *
 * The image identifies a piece faster than an ordinal or a bare title does, and
 * unlike a hover preview it works the same on touch as it does with a cursor.
 */
export function EntryRow({ post }: { post: PostCard }) {
  const primaryTag = post.tags[0]
  const meta = [
    visibilityLabel(post.visibility),
    post.publishedAt ? formatDate(post.publishedAt) : null,
    `${post.readingTime} min`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Link href={postPath(post.slug)} className="entry">
      <span className="entry__thumb">
        {post.image && (
          <Image
            src={post.image.url}
            alt=""
            fill
            sizes={THUMB_SIZES}
            style={{ objectFit: 'cover' }}
          />
        )}
      </span>

      <div className="entry__body">
        <h3 className="entry__title">{post.title}</h3>
        {post.excerpt && <p className="entry__excerpt">{post.excerpt}</p>}
      </div>

      {primaryTag ? (
        <span className="entry__tag">{primaryTag.name}</span>
      ) : (
        <span />
      )}
      <span className="entry__meta">{meta}</span>
    </Link>
  )
}
