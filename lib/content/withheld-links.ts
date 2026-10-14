// Links to articles that are not on the site yet, rendered as their words.
//
// Scheduling here is a date on a published document (`schedule.ts`), so a piece
// written today can be linked from one going out tomorrow — and was, constantly,
// once articles started being drafted in batches. A link like that is a 404 for
// every reader until its target's date arrives, and the obvious repair is worse
// than the fault: on 7 Oct 2026 an agent saved drafts that removed such links
// from scheduled articles. Nobody published them, so seven live articles went on
// linking to 404s — and published, they would have lost the links for good the
// day their targets went out.
//
// So the link stays in the article and the page decides. A link whose target is
// a post or page that exists but is not live — a draft, or published with a
// date still ahead — renders as its own text, and becomes a link again on its
// own once the target is live and the cached page turns over (the same ten
// minutes `SCHEDULE_GRANULARITY_SECONDS` already promises for the target). The
// stored body is never touched; an editor previewing a draft sees every link.
//
// Only rich-text bodies are gated. A body that renders from migrated Ghost HTML
// is injected as a string and is left exactly as it was: everything it links to
// was published on Ghost before it was. A link to a slug nothing owns is left
// alone too — it may be a redirect, and deciding that is the middleware's job.

import type { ArticleBody } from './body'

const LINK_NODE_TYPES = new Set(['link', 'autolink'])

const bareHost = (host: string): string =>
  host.toLowerCase().replace(/^www\./, '')

/**
 * The slug a link points at on this site, or null when it points anywhere else.
 *
 * Articles and pages share one URL shape — a single path segment — so that is
 * all this recognises. The apex and `www` are the same site: the apex redirects
 * to `www`, and links typed by hand use either.
 */
export function siteSlugOf(href: unknown, siteUrl: string): string | null {
  if (typeof href !== 'string' || !href.trim()) return null

  let site: URL
  let url: URL
  try {
    site = new URL(siteUrl)
    url = new URL(href.trim(), site)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (bareHost(url.hostname) !== bareHost(site.hostname)) return null

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length !== 1) return null

  try {
    return decodeURIComponent(segments[0])
  } catch {
    return null
  }
}

type Node = {
  type?: unknown
  fields?: unknown
  url?: unknown
  children?: unknown
}

function linkHref(node: Node): unknown {
  const fields = node.fields as { url?: unknown } | null | undefined
  return fields?.url ?? node.url
}

/**
 * The same tree, with every link `isWithheld` names replaced by its children.
 *
 * Walks every value, not only `root.children`, because a module's rich text —
 * an FAQ answer, a callout — is editor state inside the block's fields, and a
 * link there is the same 404. Returns the input itself when nothing changed, so
 * an article with no such link costs a walk and no copy.
 */
export function unlinkWithheld<T>(
  value: T,
  isWithheld: (href: string) => boolean,
): T {
  if (Array.isArray(value)) {
    let changed = false
    const out: unknown[] = []
    for (const item of value) {
      const node = item as Node | null
      if (
        node &&
        typeof node === 'object' &&
        typeof node.type === 'string' &&
        LINK_NODE_TYPES.has(node.type) &&
        typeof linkHref(node) === 'string' &&
        isWithheld(linkHref(node) as string)
      ) {
        changed = true
        const children = Array.isArray(node.children) ? node.children : []
        out.push(...unlinkWithheld(children, isWithheld))
        continue
      }
      const walked = unlinkWithheld(item, isWithheld)
      if (walked !== item) changed = true
      out.push(walked)
    }
    return (changed ? out : value) as T
  }

  if (value && typeof value === 'object') {
    let changed = false
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      const walked = unlinkWithheld(item, isWithheld)
      if (walked !== item) changed = true
      out[key] = walked
    }
    return (changed ? out : value) as T
  }

  return value
}

/**
 * A body as a reader should get it: links to unpublished articles unlinked.
 *
 * `withheld` holds the slugs of posts and pages that exist and are not live;
 * see `readWithheldSlugs` in `queries.ts`.
 */
export function withholdUnpublishedLinks(
  body: ArticleBody,
  withheld: ReadonlySet<string>,
  siteUrl: string,
): ArticleBody {
  if (body.kind !== 'lexical' || withheld.size === 0) return body

  const content = unlinkWithheld(body.content, (href) => {
    const slug = siteSlugOf(href, siteUrl)
    return slug !== null && withheld.has(slug)
  })

  return content === body.content ? body : { kind: 'lexical', content }
}
