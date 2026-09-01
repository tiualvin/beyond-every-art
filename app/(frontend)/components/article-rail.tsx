import Link from 'next/link'

import type { PostCard } from '@/lib/content/queries'
import type { TocEntry } from '@/lib/content/toc'
import { NEWSLETTER_PATH, postPath } from '@/lib/seo/site'

/**
 * A contents list of two is a heading with extra steps, and of one is a lie
 * about the shape of the piece. Three is where a reader can navigate by it.
 */
const MIN_TOC_ENTRIES = 3

/**
 * The column beside a post: where it goes, what it is next to, and the list.
 *
 * Every module is editorial. `docs/ADVERTISING.md` puts an ad slot in here
 * eventually, and the slot is absent for members, for anyone running a
 * blocker, and on every staging deployment — so a rail built around one is a
 * hole on those visits. It is built around the reading aids instead, and the
 * slot will be one module among them.
 *
 * No thumbnails, deliberately. The rail is hidden below 1280 rather than
 * reflowed, because everything in it reaches a phone another way — the related
 * posts through "Read next", the newsletter through the band — and a hidden
 * `<img>` is still a download on the device least able to afford one.
 *
 * The signup is a link to `/newsletter/` rather than the subscribe modal the
 * membership gate opens: the modal costs a client component, and the rail is
 * the one place on the page where a reader is browsing rather than deciding.
 */
export function ArticleRail({
  headings,
  related,
}: {
  headings: TocEntry[]
  related: PostCard[]
}) {
  const contents = headings.length >= MIN_TOC_ENTRIES ? headings : []

  return (
    <aside className="article__rail" aria-label="More from Beyond Every Art">
      {contents.length > 0 && (
        <nav className="rail__mod" aria-labelledby="rail-contents">
          <p className="rail__label" id="rail-contents">
            In this piece
          </p>
          <ol className="rail__toc">
            {contents.map((entry) => (
              <li key={entry.id}>
                <a href={`#${entry.id}`}>{entry.text}</a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {related.length > 0 && (
        <div className="rail__mod">
          <p className="rail__label" id="rail-related">
            More on this
          </p>
          <ul className="rail__list" aria-labelledby="rail-related">
            {related.map((post) => (
              <li key={post.id}>
                <Link href={postPath(post.slug)} className="rail__item">
                  <h3>{post.title}</h3>
                  <p className="rail__meta">
                    {[post.tags[0]?.name, `${post.readingTime} min`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Last, and the one that sticks, so the rail keeps a presence through a
          long read rather than running out a screen in. */}
      <div className="rail__mod rail__sticky">
        <div className="rail__signup">
          <p className="rail__label">The newsletter</p>
          <p>One piece a week on colour, material, and practice.</p>
          <Link href={NEWSLETTER_PATH} className="button button--primary">
            Join the list
          </Link>
        </div>
      </div>
    </aside>
  )
}
