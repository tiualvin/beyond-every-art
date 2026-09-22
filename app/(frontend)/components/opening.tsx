import Image from 'next/image'
import Link from 'next/link'

import { thumbnailSrc } from '@/lib/content/media'
import type { PostCard } from '@/lib/content/queries'
import { formatDate } from '@/lib/format'
import { visibilityLabel } from '@/lib/membership'
import { postPath } from '@/lib/seo/site'

/**
 * The newest work, composed.
 *
 * It replaces a band that held one article in a single row. That row sat
 * directly under a cover nearly a screen tall, which is the most valuable place
 * on the site and the least room anything there has ever been given — and it
 * was built out of the same parts as the six rows below it, so the page went
 * from a full-bleed wash to seven variations on one grammar with no contrast
 * anywhere in between.
 *
 * A lead with five runners beside it is the other half of a magazine's opening
 * spread: one piece at the size of a decision, the rest at the size of a
 * contents list. It also carries six articles instead of one, which is what
 * lets "Editors' picks" below it stop being a recency feed wearing a curated
 * label — see `selectPicks`.
 *
 * **The runners are deliberately not `EntryRow`s.** That component is the
 * archive's grammar, with room for an excerpt, a subject and a membership
 * badge. Five of them here would restate the list below rather than balance the
 * lead against it, and the column has about a third of the width to do it in.
 */
export function Opening({
  lead,
  runners,
}: {
  lead: PostCard
  runners: PostCard[]
}) {
  return (
    <section className="opening-band" aria-label="Latest">
      <div className="container opening">
        <LeadArticle post={lead} />

        {runners.length > 0 && (
          <div className="opening__runners">
            <p className="opening__label" id="opening-runners">
              Also new
            </p>
            <ul
              className="opening__runner-list"
              aria-labelledby="opening-runners"
            >
              {runners.map((post) => (
                <li key={post.id}>
                  <Runner post={post} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

/** Byline, membership and date, in the order every listing on the site uses. */
function meta(post: PostCard): string {
  return [
    visibilityLabel(post.visibility),
    post.publishedAt ? formatDate(post.publishedAt) : null,
    `${post.readingTime} min`,
  ]
    .filter(Boolean)
    .join(' · ')
}

function LeadArticle({ post }: { post: PostCard }) {
  const byline = post.authors.map((author) => author.name).join(', ')
  const eyebrow = ['Latest', post.tags[0]?.name].filter(Boolean).join(' · ')

  return (
    <Link href={postPath(post.slug)} className="opening__lead">
      {post.image ? (
        <span className="opening__plate">
          <Image
            // The original rather than the 768px card: this plate is around
            // 42rem wide on a desktop, which is past what `thumbnailSrc` is
            // sized for, and handing the optimiser the card would cap it there.
            src={post.image.url}
            alt=""
            fill
            sizes="(max-width: 56rem) 100vw, 42rem"
            style={{ objectFit: 'cover' }}
            priority
          />
        </span>
      ) : (
        <span className="opening__plate plate-wash" />
      )}

      <p className="eyebrow opening__eyebrow">{eyebrow}</p>
      <h2 className="opening__title">{post.title}</h2>
      {post.excerpt && <p className="opening__standfirst">{post.excerpt}</p>}
      <p className="opening__meta">
        {[byline, meta(post)].filter(Boolean).join(' · ')}
      </p>
    </Link>
  )
}

function Runner({ post }: { post: PostCard }) {
  return (
    <Link href={postPath(post.slug)} className="opening__runner">
      {post.image ? (
        <span className="opening__runner-plate">
          <Image
            src={thumbnailSrc(post.image)}
            alt=""
            fill
            sizes="3.5rem"
            style={{ objectFit: 'cover' }}
          />
        </span>
      ) : (
        <span className="opening__runner-plate plate-wash" />
      )}
      <span className="opening__runner-body">
        <h3 className="opening__runner-title">{post.title}</h3>
        <span className="opening__runner-meta">{meta(post)}</span>
      </span>
    </Link>
  )
}
