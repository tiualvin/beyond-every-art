// Pure helpers for rewriting Ghost media references to their new Payload URLs.
//
// After media is uploaded, every old Ghost URL (including __GHOST_URL__
// placeholders) that appears in a post's legacyHTML must point at the migrated
// asset instead of the old Ghost domain — the handoff is explicit that
// production content must not hotlink back to Ghost.

/** A migrated media asset: its Payload document id and public URL. */
export interface MediaRef {
  id: string
  url: string
}

/**
 * Derive a stable, filesystem-safe filename from a media URL. Query strings and
 * fragments are dropped; the path basename is kept so migrated files stay
 * recognizable (Payload deduplicates colliding names on upload).
 */
export function deriveMediaFilename(url: string): string {
  // Prefer the parsed pathname so the scheme/host never leaks into the name;
  // fall back to raw string handling for non-URL forms like __GHOST_URL__/...
  let path = url
  try {
    path = new URL(url).pathname
  } catch {
    path = url.split(/[?#]/)[0]
  }
  const base = path.split('/').filter(Boolean).pop() ?? ''
  const decoded = safeDecode(base)
  const cleaned = decoded.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned || 'file'
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Replace every occurrence of each old media URL in `html` with its new URL.
 * Longer URLs are replaced first so a URL that is a prefix of another cannot
 * partially clobber it. Plain string replacement is used (no regex) so URL
 * characters never need escaping.
 */
export function rewriteMediaUrls(
  html: string | null | undefined,
  media: Map<string, MediaRef>,
): string {
  if (!html) return html ?? ''
  let output = html
  const oldUrls = [...media.keys()].sort((a, b) => b.length - a.length)
  for (const oldUrl of oldUrls) {
    const ref = media.get(oldUrl)
    if (!ref) continue
    output = output.split(oldUrl).join(ref.url)
  }
  return output
}
