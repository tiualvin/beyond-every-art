// Keeping stored media URLs in the shape the file route actually serves.
//
// Payload serves an upload at `/api/media/file/<name>` and redirects the
// slashed form to it. A browser follows that redirect, so a stored
// `/api/media/file/<name>/` looks harmless until something fetches it without
// following redirects — which is exactly what `next/image` does. The optimiser
// dispatches a local `url` through the app's own request handler, reads the 308
// as the resource, fails to sniff an image, and answers `400 The requested
// resource isn't a valid image.` Every feature image and card thumbnail on the
// site then fails to render.
//
// The read path already normalises (`normalizeMediaUrl` in
// `lib/content/media.ts`), so existing rows render correctly as soon as this
// code ships. This hook is the write half: it stops a trailing slash being
// stored again, whatever produced it, so the database heals as documents are
// next saved rather than carrying a defect that needs a one-off repair.

/** A trailing slash is never part of the address Payload answers without a redirect. */
export function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

type SizedUrl = { url?: unknown }
type WithMediaUrls = {
  url?: unknown
  sizes?: unknown
}

/**
 * Returns a copy of a media document with every stored URL deslashed.
 *
 * Only `url` and `sizes.<name>.url` can carry the defect; everything else is
 * passed through untouched so this cannot disturb a document it does not own.
 */
export function stripMediaUrlSlashes<T extends object>(data: T): T {
  const next: WithMediaUrls = { ...data }

  if (typeof next.url === 'string') {
    next.url = stripTrailingSlashes(next.url)
  }

  if (next.sizes && typeof next.sizes === 'object') {
    const sizes: Record<string, SizedUrl> = {}
    for (const [name, size] of Object.entries(
      next.sizes as Record<string, SizedUrl>,
    )) {
      if (size && typeof size === 'object' && typeof size.url === 'string') {
        sizes[name] = { ...size, url: stripTrailingSlashes(size.url) }
      } else {
        sizes[name] = size
      }
    }
    next.sizes = sizes
  }

  return next as T
}
