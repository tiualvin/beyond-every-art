/**
 * A featured image resolved from a Payload media record, in the shape the
 * frontend renders. Kept free of Payload types so it can be unit tested.
 */
export type MediaImage = {
  url: string
  /** Alternative text; empty means the image is decorative. */
  alt: string
  /** Intrinsic size when the record stores it, so space can be reserved. */
  width: number | null
  height: number | null
  caption: string | null
  credit: string | null
  /**
   * Pre-generated derivatives, when the record has them.
   *
   * `Media` produces a 768px `card` and a 1200x630 `og`, but only at upload
   * time — anything already in the library predates a size that was added
   * later and simply will not have it. Both are therefore optional and every
   * reader falls back to `url`, which is what the whole site used before these
   * existed. `cardUrl` feeds listing thumbnails, `ogUrl` feeds share cards.
   */
  cardUrl: string | null
  ogUrl: string | null
}

const IMAGE_FILE_EXTENSION = /\.(avif|gif|jpe?g|png|svg|tiff?|webp)$/i

/**
 * Normalizes the alt text of a media record.
 *
 * Ghost fills a missing alt attribute with the uploaded file's name, and the
 * Payload collection makes `alt` required, so migrated records can arrive
 * carrying something like `screenshot-2019-04-02.png`. A screen reader would
 * announce that verbatim, which is worse than announcing nothing: an image with
 * no useful description belongs in the accessibility tree as decorative. Blank
 * and filename-shaped values therefore both collapse to the empty string.
 */
export function toAltText(
  alt: string | null | undefined,
  filename?: string | null,
): string {
  const trimmed = (alt ?? '').trim()
  if (!trimmed) return ''

  const file = (filename ?? '').trim()
  if (file && trimmed.toLowerCase() === file.toLowerCase()) return ''

  // A single unbroken token ending in an image extension is a file name, not a
  // description. Real alt text is a phrase, so it contains whitespace.
  if (!/\s/.test(trimmed) && IMAGE_FILE_EXTENSION.test(trimmed)) return ''

  return trimmed
}

function toDimension(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }
  return Math.round(value)
}

function toOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

type RawMedia = {
  url?: unknown
  alt?: unknown
  filename?: unknown
  caption?: unknown
  credit?: unknown
  width?: unknown
  height?: unknown
  sizes?: unknown
}

/** The URL of one generated size, or null when it was never generated. */
function sizeUrl(sizes: unknown, name: string): string | null {
  if (!sizes || typeof sizes !== 'object') return null
  const size = (sizes as Record<string, unknown>)[name]
  if (!size || typeof size !== 'object') return null
  return toOptionalText((size as { url?: unknown }).url)
}

/**
 * Turns a populated Payload upload relationship into a renderable image.
 *
 * Returns `null` when there is nothing to render: an empty relationship, a
 * relationship left as a bare ID (a query run at `depth: 0`), or a record whose
 * file never resolved to a URL. Callers treat `null` as "no featured image".
 */
export function toMediaImage(value: unknown): MediaImage | null {
  if (!value || typeof value !== 'object') return null

  const raw = value as RawMedia
  const url = typeof raw.url === 'string' ? raw.url.trim() : ''
  if (!url) return null

  const filename = typeof raw.filename === 'string' ? raw.filename : null

  return {
    url,
    alt: toAltText(typeof raw.alt === 'string' ? raw.alt : null, filename),
    width: toDimension(raw.width),
    height: toDimension(raw.height),
    caption: toOptionalText(raw.caption),
    credit: toOptionalText(raw.credit),
    cardUrl: sizeUrl(raw.sizes, 'card'),
    ogUrl: sizeUrl(raw.sizes, 'og'),
  }
}

/**
 * The source a listing thumbnail should load.
 *
 * Every thumbnail on the site renders somewhere between 4.5rem and a card
 * width, and `next/image` resizes whatever it is given — so handing it the
 * original meant the optimiser decoding a multi-megabyte photograph to produce
 * a 72px plate, once per size, on every cold cache entry. The 768px derivative
 * already exists; this is what points at it.
 *
 * Falls back to the original, which is what a record uploaded before the size
 * existed will need.
 */
export function thumbnailSrc(image: MediaImage): string {
  return image.cardUrl ?? image.url
}

/**
 * The source an `og:image` should name.
 *
 * A share card is fetched by crawlers, not by readers, and they crop it to
 * roughly 1.91:1 regardless — so the pre-generated `og` size is both smaller
 * and closer to what they will show. Same fallback, same reason.
 */
export function shareImageSrc(image: MediaImage): string {
  return image.ogUrl ?? image.url
}
