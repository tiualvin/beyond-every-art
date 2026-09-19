import Link from 'next/link'

import { adClientFor } from '@/lib/ads/eligibility'
import type { PostCard } from '@/lib/content/queries'
import type { TocEntry } from '@/lib/content/toc'
import { postPath } from '@/lib/seo/site'

import { AdUnit } from './ad-unit'
import { SubscribeLink } from './subscribe-link'

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
 * The group is taller than a laptop's viewport, so something in it has to
 * give. `.rail__sticky` in `app/globals.css` carries the ladder that decides
 * what, in order — the newsletter card's line of copy, then its frame, then
 * the related list, then the list entirely — measured so that all three
 * related pieces survive down to 683px of viewport rather than the 826 they
 * used to need. `docs/POST_PAGE_LAYOUT.md` has the numbers.
 *
 * No thumbnails, deliberately. The rail is hidden below 1280 rather than
 * reflowed, because everything in it reaches a phone another way — the related
 * posts through "Read next", the newsletter through the band — and a hidden
 * `<img>` is still a download on the device least able to afford one.
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
      {/* `--ad` is what the height rungs in `app/globals.css` key on. They
          exist because 265.7px of the group is a unit that cannot shrink, so
          a rail without one has nothing to shed and should shed nothing. */}
      <div className={`rail__sticky${adClient ? ' rail__sticky--ad' : ''}`}>
        {/* Rendered only where there is a publisher to render it for. An empty
            250px reservation was right while there was no ad layer; now that
            there is one, a deployment that will never serve a unit — staging,
            a teaser — should get the 279px back rather than a hole above "More
            on this". Nothing shifts either way: the reservation exists to stop
            a unit collapsing mid-view, not to stand in for one. */}
        {adClient && (
          <div className="rail__slot">
            <AdUnit placement="rail-1" client={adClient} />
          </div>
        )}

        {/* The elastic module, and the last one to give. The unit keeps its
            250px and the newsletter card sheds its copy and then its frame
            before this list loses a piece — three related pieces is what
            `RAIL_COUNT` asks for and what the ladder is measured to fit. */}
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
            {/* Classed because the ladder hides this line first: it is the
                cheapest thing in the group, and 50px the third related piece
                needs more than the framing does. */}
            <p className="rail__copy">
              One piece a week on colour, material, and practice.
            </p>
            <SubscribeLink className="button button--primary">
              Join the list
            </SubscribeLink>
          </div>
        </div>
      </div>
    </aside>
  )
}
