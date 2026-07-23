// Pure helpers for discovering media references inside Ghost content.
//
// Ghost stores images both in dedicated fields (feature_image, og_image) and
// inline within rendered HTML. Inline references may be absolute URLs or use
// Ghost's `__GHOST_URL__` placeholder. This module only *finds* the URLs so the
// dry-run report can list what will need downloading; the actual download and
// Cloudflare R2 upload is a separate step.

const MEDIA_EXTENSIONS =
  'png|jpe?g|gif|webp|avif|svg|bmp|ico|mp4|webm|mov|m4v|mp3|wav|ogg|m4a|pdf'

// Matches src="..." / href="..." / srcset entries pointing at a media file.
const ATTR_URL = new RegExp(
  `(?:src|href)\\s*=\\s*["']([^"']+\\.(?:${MEDIA_EXTENSIONS})(?:\\?[^"']*)?)["']`,
  'gi',
)

// Ghost placeholder form, e.g. __GHOST_URL__/content/images/2023/01/x.jpg
const GHOST_PLACEHOLDER = new RegExp(
  `__GHOST_URL__/content/[^\\s"')]+\\.(?:${MEDIA_EXTENSIONS})(?:\\?[^\\s"')]*)?`,
  'gi',
)

/** Extract media URLs referenced inside a block of Ghost HTML. */
export function extractMediaUrlsFromHtml(
  html: string | null | undefined,
): string[] {
  if (!html) return []
  const found = new Set<string>()
  for (const match of html.matchAll(ATTR_URL)) found.add(match[1])
  for (const match of html.matchAll(GHOST_PLACEHOLDER)) found.add(match[0])
  return [...found]
}

/**
 * Collect all unique media URLs for a single piece of content: inline HTML plus
 * any explicit image fields (feature image, social image, etc.).
 */
export function collectMediaUrls(
  html: string | null | undefined,
  ...fields: Array<string | null | undefined>
): string[] {
  const urls = new Set<string>(extractMediaUrlsFromHtml(html))
  for (const field of fields) {
    if (field) urls.add(field)
  }
  return [...urls]
}
