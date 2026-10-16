// Where a link in an article goes.
//
// An article on the website opens in the app; everything else opens in the
// system browser. "An article" is a one-segment path on the site's own host —
// the shape every post URL has — whose segment no website route owns. The apex
// and `www` are the same site, as they are to the website's own link handling.

import { RESERVED_ROOT_SLUGS } from '../generated/reserved-slugs'

export type LinkTarget =
  | { kind: 'article'; slug: string; href: string }
  | { kind: 'external'; href: string }
  | { kind: 'none' }

const reserved = new Set<string>(RESERVED_ROOT_SLUGS)
const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, '')

export function classifyLink(raw: string, siteUrl: string): LinkTarget {
  const value = raw.trim()
  // An anchor within the page. The reader has no anchors to jump to, so the
  // words stay and the link does not.
  if (!value || value.startsWith('#')) return { kind: 'none' }

  let url: URL
  let site: URL
  try {
    site = new URL(siteUrl)
    url = new URL(value, `${site.origin}/`)
  } catch {
    return { kind: 'none' }
  }

  if (url.protocol === 'mailto:')
    return { kind: 'external', href: url.toString() }
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    return { kind: 'none' }

  if (
    bareHost(url.hostname) === bareHost(site.hostname) &&
    url.port === site.port
  ) {
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length === 1) {
      let slug: string
      try {
        slug = decodeURIComponent(segments[0]!)
      } catch {
        return { kind: 'external', href: url.toString() }
      }
      if (!reserved.has(slug.toLowerCase())) {
        return { kind: 'article', slug, href: url.toString() }
      }
    }
  }

  return { kind: 'external', href: url.toString() }
}
