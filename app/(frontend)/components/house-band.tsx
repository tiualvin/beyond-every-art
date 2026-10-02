import Link from 'next/link'

import type { RailFallback as Fallback } from '@/lib/content/queries'

/**
 * What a billboard holds when no ad is served.
 *
 * `docs/ADVERTISING.md` §8: an unfilled slot shows house content, not a blank.
 * The rail has had this since #173 (`RailFallback`) and the in-body units since
 * #176 (`InlinePromo`); this is the same idea for the three wide placements —
 * `article-end`, `archive-inline` and `home-mid` — which reserve 250px whether
 * or not Google fills them.
 *
 * **It reuses the rail's supply rather than adding a second configuration.**
 * `SiteSettings → railFallback` is already the site's "what we show when no ad
 * is served" content: up to three posts, or one of the apps. Adding a parallel
 * field for the billboards would mean a second editor surface, a second
 * migration during cutover, and two places for the same decision to drift. So
 * the field is generalised (its label and description say so) and this renders
 * the same content in a different shape.
 *
 * **A band, not a list, and that is the difference from the rail.** The rail is
 * a 300px column, so its promo stacks a headline and a standfirst. A billboard
 * is 970×250, so this lays the same pieces out in a row: the wide shape is the
 * whole point of the placement, and a single column of text in it would read as
 * a rail promo that had failed to fill its box.
 *
 * It costs a reader who gets an ad nothing. The markup sits in a `display: none`
 * subtree until the slot is known to be empty — `AdUnit` sets `data-fill` — so
 * it is out of the accessibility tree and never fetched until then.
 */
export function HouseBand({ fallback }: { fallback: Fallback }) {
  if (!fallback) return null

  if (fallback.kind === 'app') {
    return (
      <div className="house-band house-band--app">
        <p className="house-band__label eyebrow">From Beyond Every Art</p>
        <Link href={fallback.href} className="house-band__app">
          <h3 className="house-band__title">{fallback.name}</h3>
          {fallback.tagline && (
            <p className="house-band__excerpt">{fallback.tagline}</p>
          )}
        </Link>
      </div>
    )
  }

  return (
    <div className="house-band">
      <p className="house-band__label eyebrow">More from the journal</p>
      <ul className="house-band__list">
        {fallback.posts.map((post) => (
          <li key={post.href}>
            <Link href={post.href} className="house-band__item">
              <span className="house-band__title">{post.title}</span>
              {post.excerpt && (
                <span className="house-band__excerpt">{post.excerpt}</span>
              )}
              {post.meta && (
                <span className="house-band__meta">{post.meta}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
