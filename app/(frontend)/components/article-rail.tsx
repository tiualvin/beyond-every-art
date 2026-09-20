import Image from 'next/image'

import { adClientFor } from '@/lib/ads/eligibility'
import type { MediaImage } from '@/lib/content/media'
import type { RailFallback as Fallback } from '@/lib/content/queries'
import type { TocEntry } from '@/lib/content/toc'

import { AdUnit } from './ad-unit'
import { RailFallback } from './rail-fallback'
import { SubscribeLink } from './subscribe-link'

/**
 * A contents list of two is a heading with extra steps, and of one is a lie
 * about the shape of the piece. Three is where a reader can navigate by it.
 */
const MIN_TOC_ENTRIES = 3

/**
 * The rail is 300px and hidden below 1280, so the card is the only box the
 * picture has to fill and one width is the whole truth.
 */
const SIGNUP_IMAGE_SIZES = '300px'

/**
 * The column beside a post: where it goes, what it is next to, and the offer.
 *
 * Three modules, down from four. A contents list in flow at the top, then a
 * sticky pair — the `rail-1` ad unit from `docs/ADVERTISING.md` §8, and the
 * newsletter card — that travels with the reader for the rest of the scroll.
 * The contents list stays out of that pair deliberately: it belongs to the top
 * of the piece, and a reader below the sections it names is done with it.
 *
 * **"More on this" is gone**, and that is the change this shape is built
 * around. Three related pieces, a square ad and a signup came to 712px in a
 * box capped at the viewport less 100, so on an ordinary laptop something was
 * always being cut — and what got cut was the related list, which is the one
 * module here that duplicates something else on the page. Every piece it
 * listed still closes the article in "Read next", on every device, where the
 * rail reached only desktop. Removing it costs a reader nothing and buys the
 * newsletter the room to be worth looking at.
 *
 * So the card is the rail's own content now rather than a footnote under a
 * list: a picture the editor chooses in `SiteSettings`, a heading, a line, and
 * the control. `.rail__signup` in `app/globals.css` steps the picture down and
 * then away on a short window, because a 300x250 unit cannot shrink and
 * something has to.
 *
 * The picture is the one `<img>` in this column, and the rail is hidden rather
 * than reflowed below 1280 — so it must not cost a phone a download for
 * something it never shows. `next/image` lazy-loads by default and a
 * `display: none` ancestor gives it no box to intersect the viewport with, so
 * the request is never made. Verified in Chromium at 390px rather than assumed;
 * `docs/POST_PAGE_LAYOUT.md` records the check.
 */
export function ArticleRail({
  headings,
  newsletterImage = null,
  railFallback = null,
  restricted = false,
}: {
  headings: TocEntry[]
  /** From `SiteSettings`; null is the ordinary state, not a failure. */
  newsletterImage?: MediaImage | null
  /** What the ad box holds when no ad is served. Also from `SiteSettings`. */
  railFallback?: Fallback
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

      {/* Both modules travel together and stay with the reader for the rest of
          the scroll. The contents list is deliberately outside it: it belongs
          to the top of the piece, and a reader who has scrolled past the
          sections it names is done with it. */}
      <div className={`rail__sticky${adClient ? ' rail__sticky--ad' : ''}`}>
        {/* Rendered only where there is a publisher to render it for. An empty
            250px reservation was right while there was no ad layer; now that
            there is one, a deployment that will never serve a unit — staging,
            a teaser — should get the space back rather than a hole above the
            card. Nothing shifts either way: the reservation exists to stop a
            unit collapsing mid-view, not to stand in for one. */}
        {adClient && (
          <div className="rail__slot">
            {/* The fallback is rendered here, on the server, and handed across
                the client boundary as children — `AdUnit` is the only thing
                that can know whether an ad arrived, but it has no business
                knowing what an editor chose to show instead. */}
            <AdUnit placement="rail-1" client={adClient}>
              <RailFallback fallback={railFallback} />
            </AdUnit>
          </div>
        )}

        <div className="rail__mod">
          <div className="rail__signup">
            {newsletterImage && (
              <div className="rail__signup-figure">
                <Image
                  src={newsletterImage.cardUrl || newsletterImage.url}
                  alt={newsletterImage.alt}
                  fill
                  sizes={SIGNUP_IMAGE_SIZES}
                  style={{ objectFit: 'cover' }}
                />
              </div>
            )}
            <div className="rail__signup-body">
              <p className="rail__label">The newsletter</p>
              {/* The modal's own heading. A card that opens it should promise
                  the same thing the thing it opens promises. */}
              <h3 className="rail__signup-title">Stay close to the work</h3>
              {/* Classed because the ladder hides this line when the picture
                  has already gone and the window is shorter still. */}
              <p className="rail__copy">
                One piece a week on colour, material, and practice.
              </p>
              <SubscribeLink className="button button--primary">
                Join the list
              </SubscribeLink>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
