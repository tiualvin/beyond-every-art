// Which links in a publication may become something a reader clicks.
//
// A PDF carries its own links, and nobody on this site wrote them. A designer's
// export can hold `javascript:` and `data:` URIs, `file:` paths from the
// machine it was made on, plaintext `http:` addresses from a print run years
// ago, and absolute links to this site under whichever hostname it had at the
// time. Processing pulls them all out; this decides what each one is before it
// is stored, and again before it is rendered, because a stored value can also
// arrive from a restore or an import that never ran the first check — the same
// reasoning as `safeHref` in `lib/content/embed.ts` and `toCreditURL` in
// `lib/content/attribution.ts`.
//
// The rules match those two rather than inventing a third policy:
//
// - **https only** for anywhere else. `http:` is refused rather than upgraded,
//   because an upgraded link to a site with no certificate is a broken link
//   that looks deliberate. A refusal is visible to the editor reviewing
//   extracted links, who can fix the address or drop it.
// - **This site becomes a path.** A link to `beyondeveryart.com` or its `www`
//   host, under either scheme, is an internal link, and is rendered relative so
//   it follows the reader's hostname and opens in the same tab.
// - **mailto** is kept for a single address, because the brief has an email
//   hotspot type. Its other parameters are dropped: a PDF has no business
//   pre-filling a stranger's `cc`.
//
// Nothing here decides whether a link is shown. Extracted links are stored as
// unapproved and an editor approves them (`docs/PUBLICATION_SYSTEM.md`); this
// only decides what an approved link may be.

import { getSiteUrl } from '../seo/site'

export type RefusedReason =
  'empty' | 'unparseable' | 'insecure' | 'credentials' | 'scheme'

export type PublicationLink =
  /** A path on this site, relative, with the trailing slash the site serves. */
  | { kind: 'internal'; href: string }
  /** An https address somewhere else. */
  | { kind: 'external'; href: string }
  /** `mailto:` one address. */
  | { kind: 'email'; href: string }
  /** Not a link this site will render, and why. */
  | { kind: 'refused'; reason: RefusedReason }

/** One address, no list, no whitespace or delimiters a mail client would split on. */
const EMAIL_ADDRESS =
  /^[^\s@,;:<>()[\]\\"]+@[^\s@,;:<>()[\]\\"]+\.[^\s@,;:<>()[\]\\".]+$/

/** The hostnames this site answers on: the configured one, with and without `www.`. */
function siteHosts(siteUrl: string): Set<string> {
  try {
    const host = new URL(siteUrl).hostname.toLowerCase()
    const bare = host.replace(/^www\./, '')
    return new Set([bare, `www.${bare}`])
  } catch {
    return new Set()
  }
}

/**
 * A path in the shape the site serves it.
 *
 * `trailingSlash` is on (`next.config.ts`), so `/journal` answers with a
 * redirect to `/journal/`. Adding the slash here saves every click on a link
 * from a print layout that hop. A last segment with a dot in it is a file —
 * `/api/media/file/plate.webp` — and is left alone.
 *
 * **Leading slashes collapse to one, and this is the security half.** A URL
 * on this site can carry a path that starts `//` — written that way, or
 * produced by resolving `/.//evil.example` — and once the origin is dropped
 * that path is a protocol-relative link to another host. The origin check
 * above it passes, because the URL really was on this site until this function
 * made it relative.
 */
function servedPath(url: URL): string {
  const pathname = url.pathname.replace(/^\/{2,}/, '/')
  const last = pathname.split('/').pop() ?? ''
  const path =
    pathname.endsWith('/') || last.includes('.') ? pathname : `${pathname}/`
  return `${path}${url.search}${url.hash}`
}

function email(url: URL): PublicationLink {
  let address: string
  try {
    address = decodeURIComponent(url.pathname).trim()
  } catch {
    return { kind: 'refused', reason: 'unparseable' }
  }
  if (!EMAIL_ADDRESS.test(address)) return { kind: 'refused', reason: 'scheme' }
  return { kind: 'email', href: `mailto:${address}` }
}

/**
 * What a link from a publication is, and the href to render if it is one.
 *
 * `siteUrl` defaults to the configured origin; it is a parameter so tests and
 * the processing worker can name it explicitly.
 */
export function classifyPublicationLink(
  value: unknown,
  siteUrl: string = getSiteUrl(),
): PublicationLink {
  if (typeof value !== 'string') return { kind: 'refused', reason: 'empty' }
  const raw = value.trim()
  if (!raw) return { kind: 'refused', reason: 'empty' }

  const hosts = siteHosts(siteUrl)

  // A root-relative path is resolved against the site and must still be on it
  // afterwards. That is the whole check, and it is what catches `//evil.example`
  // and `/\evil.example` — both of which a browser reads as another host.
  if (raw.startsWith('/')) {
    let resolved: URL
    try {
      resolved = new URL(raw, siteUrl)
    } catch {
      return { kind: 'refused', reason: 'unparseable' }
    }
    if (resolved.origin !== new URL(siteUrl).origin) {
      return { kind: 'refused', reason: 'scheme' }
    }
    return { kind: 'internal', href: servedPath(resolved) }
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    // Relative paths without a leading slash land here too. They have no
    // meaning inside a PDF that is served from somewhere else.
    return { kind: 'refused', reason: 'unparseable' }
  }

  if (url.protocol === 'mailto:') return email(url)

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { kind: 'refused', reason: 'scheme' }
  }

  // `https://beyondeveryart.com@evil.example/` goes to evil.example. Nothing
  // legitimate in a publication needs a username in its links, and the form
  // exists mainly to make one host look like another.
  if (url.username || url.password) {
    return { kind: 'refused', reason: 'credentials' }
  }

  if (hosts.has(url.hostname.toLowerCase())) {
    return { kind: 'internal', href: servedPath(url) }
  }

  if (url.protocol !== 'https:') return { kind: 'refused', reason: 'insecure' }

  return { kind: 'external', href: url.toString() }
}
