import Image from 'next/image'
import Link from 'next/link'

import type { RailFallback as Fallback } from '@/lib/content/queries'

/** The rail is 300px and hidden below it, so one width is the whole truth. */
const PROMO_IMAGE_SIZES = '300px'

/**
 * What the rail's ad box holds when no ad is served.
 *
 * The slot reserves 300x250 and holds it whether or not Google fills it, so
 * without this a reader gets a labelled empty box — which is most readers on a
 * site whose ad account is new, and every reader running a blocker. `AdUnit`
 * decides when this is visible; this decides what it says.
 *
 * **It has to fill 250px, and that is the whole design problem.** The first
 * version put one headline in the middle of the box and left the rest as
 * paper. A list of up to three fills it the way the related module used to,
 * and a single pick becomes a featured piece — its own picture where it has
 * one, its standfirst where it does not — so one article reads as a choice
 * rather than as a list with two items missing.
 *
 * Deliberately not a bordered card. The newsletter card sits directly beneath
 * this and already carries a surface and a border; a second one stacked on top
 * reads as two competing boxes rather than as a rail. This is the quieter
 * grammar the related list had — an eyebrow, serif lines, a detail under each.
 */
export function RailFallback({ fallback }: { fallback: Fallback }) {
  if (!fallback) return null

  if (fallback.kind === 'app') {
    return (
      <div className="rail__promo">
        <p className="rail__label">From Beyond Every Art</p>
        <Link href={fallback.href} className="rail__promo-item">
          <h3>{fallback.name}</h3>
          {fallback.tagline && (
            <p className="rail__promo-excerpt">{fallback.tagline}</p>
          )}
        </Link>
      </div>
    )
  }

  const { posts } = fallback
  const featured = posts.length === 1
  const cover = featured ? posts[0].image : null

  return (
    <div className={`rail__promo${featured ? ' rail__promo--featured' : ''}`}>
      <p className="rail__label">
        {featured ? 'Worth reading' : 'More from the journal'}
      </p>
      <ul className="rail__promo-list">
        {posts.map((post) => (
          <li key={post.href}>
            <Link href={post.href} className="rail__promo-item">
              {cover && (
                <span className="rail__promo-figure">
                  <Image
                    src={cover.cardUrl || cover.url}
                    alt={cover.alt}
                    fill
                    sizes={PROMO_IMAGE_SIZES}
                    style={{ objectFit: 'cover' }}
                  />
                </span>
              )}
              <h3>{post.title}</h3>
              {/* The standfirst fills what a picture would have, and only in
                  the single-pick case. In a list of three it would be the
                  thing that pushed the third item out of the box. */}
              {featured && !cover && post.excerpt && (
                <p className="rail__promo-excerpt">{post.excerpt}</p>
              )}
              {post.meta && <p className="rail__meta">{post.meta}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
