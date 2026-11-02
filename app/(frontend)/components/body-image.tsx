import Image from 'next/image'

import { toMediaImage } from '@/lib/content/media'

/**
 * The reading column: `--text-w` is 44rem in `app/globals.css`, and from the
 * rail breakpoint the text track resolves to the same measure, so one number
 * describes the box at every desktop size. Below 47rem the column is the
 * viewport less its padding, which `100vw` overstates slightly — the safe
 * direction for a `sizes` hint.
 */
const BODY_IMAGE_SIZES = '(max-width: 47rem) 100vw, 44rem'

/**
 * An image inside a body, from a Lexical `upload` node.
 *
 * **What this exists to fix.** The upload converter shipped by
 * `@payloadcms/richtext-lexical` renders the stored media URL directly into a
 * `<picture>`: it does not go through `next/image`, and it does not go through
 * `toMediaImage`, so it inherits neither the optimiser nor the trailing-slash
 * correction `normalizeMediaUrl` makes. Measured on the first article to carry
 * inline images: 1,797,777 bytes of PNG for one image where the same pipeline
 * delivers 131,810 bytes of WebP through the optimiser, plus a 308 redirect on
 * the image and on every `<source>`. The two faults have the same cause — the
 * default converter does not know this site's media rules — so this reads the
 * node through `toMediaImage` and renders it the way every other image on the
 * site is rendered.
 *
 * **No `priority`.** A body can carry four or five of these and they are all
 * below the fold, so marking them high priority would compete with the featured
 * image that `FeaturedFigure` correctly nominates as the LCP element.
 *
 * **A relation the query did not populate renders nothing**, which is the same
 * choice `MediaText` makes and for the same reason: an unpopulated upload is the
 * ordinary state of a read at too shallow a depth, and an empty frame is worse
 * than an absent one. Post and page reads run at `depth: 1` so this does not
 * happen in production; it is what a caller at `depth: 0` gets.
 */
export function BodyImage({ value }: { value?: unknown }) {
  const image = toMediaImage(value)
  if (!image) return null

  return (
    <figure className="prose__figure">
      {image.width && image.height ? (
        <Image
          src={image.url}
          alt={image.alt}
          width={image.width}
          height={image.height}
          sizes={BODY_IMAGE_SIZES}
        />
      ) : (
        // A record that stores no intrinsic size still needs its space
        // reserved, so it fills a fixed editorial ratio rather than jumping
        // the column when it loads.
        <span className="prose__figure-fill">
          <Image
            src={image.url}
            alt={image.alt}
            fill
            sizes={BODY_IMAGE_SIZES}
            style={{ objectFit: 'cover' }}
          />
        </span>
      )}
      {image.caption && <figcaption>{image.caption}</figcaption>}
    </figure>
  )
}
