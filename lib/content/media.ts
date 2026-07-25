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
  }
}
