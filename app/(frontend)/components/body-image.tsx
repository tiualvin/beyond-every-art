import Image from 'next/image'

import { attributionHref } from '@/lib/content/attribution'
import type { BodyImage as BodyImageValue } from '@/lib/content/body-image'

/**
 * An image in the body fills the reading column and stops there: the measure
 * is 44rem from a tablet up, and the full width of a phone below that. The same
 * box a gallery row fills, for the same reason — `docs/POST_PAGE_LAYOUT.md` —
 * and tests/design/article-layout.test.ts checks this against the stylesheet.
 */
export const BODY_IMAGE_SIZES = '(max-width: 47rem) 100vw, 44rem'

/**
 * An image placed in an article's body: a `<figure>` with its caption and
 * credit in a `<figcaption>`.
 *
 * Payload's default upload converter renders a bare `<img>` — no caption, no
 * credit, no `sizes`, so a phone downloads the original. This is the featured
 * image's figure (`FeaturedFigure` in `article.tsx`) with two differences that
 * matter: it is lazy, because nothing in a body is above the fold — the hero
 * holds the LCP element — and its width and height always reserve its space,
 * so a late image cannot shift the text under a reader.
 */
export function BodyImage({ figure }: { figure: BodyImageValue }) {
  const { image, caption, credit } = figure
  const creditHref = attributionHref(figure.creditURL)

  return (
    <figure className="article__figure body-figure">
      {image.width && image.height ? (
        <Image
          src={image.url}
          alt={image.alt}
          width={image.width}
          height={image.height}
          sizes={BODY_IMAGE_SIZES}
          loading="lazy"
        />
      ) : (
        <span className="article__figure-fill">
          <Image
            src={image.url}
            alt={image.alt}
            fill
            sizes={BODY_IMAGE_SIZES}
            loading="lazy"
          />
        </span>
      )}
      {(caption || credit) && (
        <figcaption>
          {caption}
          {credit && (
            <span className="article__figure-credit">
              {creditHref ? (
                <a href={creditHref} target="_blank" rel="noopener noreferrer">
                  {credit}
                </a>
              ) : (
                credit
              )}
            </span>
          )}
        </figcaption>
      )}
    </figure>
  )
}
