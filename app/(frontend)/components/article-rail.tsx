import Link from 'next/link'

import { adClientFor } from '@/lib/ads/eligibility'
import type { PostCard } from '@/lib/content/queries'
import type { TocEntry } from '@/lib/content/toc'
import { NEWSLETTER_PATH, postPath } from '@/lib/seo/site'

import { AdUnit } from './ad-unit'

/**
 * A contents list of two is a heading with extra steps, and of one is a lie
 * about the shape of the piece. Three is where a reader can navigate by it.
 */
const MIN_TOC_ENTRIES = 3

/**
 * The column beside a post: where it goes, what it is next to, and the list.
 *
 * Every module is editorial except one. The `rail-1` slot from
 * `docs/ADVERTISING.md` §8 is filled now, and it is absent for anyone running
 * a blocker, on every staging deployment, on a restricted teaser, and later
 * for members — so the rail is built around the reading aids and the unit is
 * one module among them rather than the thing the others decorate.
 *
 * The unit, the related pieces and the newsletter are one sticky group, so
 * they stay with the reader for the rest of the scroll rather than passing by
 * once. The contents list stays in flow above it: it belongs to the top of the
 * piece, and a reader below the sections it names is done with it.
 *
 * The group is taller than a laptop's viewport, so one module in it has to
 * give. It is the related list — the unit cannot shrink and the newsletter
 * card is the one thing here a reader is meant to act on. `.rail__related` in
 * `app/globals.css` is what says so.
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
  restricted = false,
}: {
  headings: TocEntry[]
  related: PostCard[]
  /** A teaser carries no unit: docs/ADVERTISING.md §4, via `adClientFor`. */
  restricted?: boolean
}) {
  const contents = headings.length >= MIN_TOC_ENTRIES ? headings : []
  const adClient = adClientFor({ restricted })

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

      {/* Everything below travels together and stays with the reader for the
          rest of the scroll. The contents list is deliberately outside it: it
          belongs to the top of the piece, and a reader who has scrolled past
          the sections it names is done with it. */}
      <div className="rail__sticky">
        {/* Rendered only where there is a publisher to render it for. An empty
            250px reservation was right while there was no ad layer; now that
            there is one, a deployment that will never serve a unit — staging,
            a teaser — should get the space back rather than a hole above "More
            on this". Nothing shifts either way: the reservation exists to stop
            a unit collapsing mid-view, not to stand in for one. */}
        {adClient && (
          <div className="rail__slot">
            <AdUnit placement="rail-1" client={adClient} />
          </div>
        )}

        {/* The elastic module. The unit keeps its 250px and the newsletter card
            keeps its height; on a window too short for all three, this list
            is what shrinks and scrolls, so the card a reader is meant to act
            on is never the thing that falls off the bottom. */}
        {related.length > 0 && (
          <div className="rail__mod rail__related">
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

        <div className="rail__mod">
          <div className="rail__signup">
            <p className="rail__label">The newsletter</p>
            <p>One piece a week on colour, material, and practice.</p>
            <Link href={NEWSLETTER_PATH} className="button button--primary">
              Join the list
            </Link>
          </div>
        </div>
      </div>
    </aside>
  )
}
