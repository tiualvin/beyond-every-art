// Links inside a translated body, resolved at render time.
//
// A translation is usually made from the English body, links and all, so its
// links point at English articles. At render:
//
// - a link to an English article that has a live translation in this language
//   is pointed at the translation (`/foo/` → `/es/foo-traducido/`), anchor
//   kept;
// - a link to an English article that has none is left exactly as it is —
//   English is the honest fallback for a *link*, which says where it goes;
// - a link to a page in this language that is not live renders as its own
//   text, as `withheld-links.ts` already does for English: it would be a 404.
//
// The stored body is never changed, so an article translated later turns its
// links on by itself, the next time the cached page turns over.

import type { ArticleBody } from '../content/body'
import { DEFAULT_LOCALE, isPrefixedLocale, type Locale } from './locales'

const LINK_NODE_TYPES = new Set(['link', 'autolink'])

const bareHost = (host: string): string =>
  host.toLowerCase().replace(/^www\./, '')

type Node = {
  type?: unknown
  fields?: unknown
  url?: unknown
  children?: unknown
}

/** What to do with one link: keep it, point it elsewhere, or unlink it. */
export type LinkDecision = { href: string } | 'keep' | 'unlink'

/**
 * The same tree with every link passed through `decide`. Walks every value, so
 * a link inside a module's rich text (an FAQ answer) is handled like one in
 * the body. Returns the input itself when nothing changed.
 */
export function mapLinks<T>(
  value: T,
  decide: (href: string) => LinkDecision,
): T {
  if (Array.isArray(value)) {
    let changed = false
    const out: unknown[] = []
    for (const item of value) {
      const node = item as Node | null
      const fields = node?.fields as { url?: unknown } | undefined
      const href = fields?.url ?? node?.url
      if (
        node &&
        typeof node === 'object' &&
        typeof node.type === 'string' &&
        LINK_NODE_TYPES.has(node.type) &&
        typeof href === 'string'
      ) {
        const decision = decide(href)
        const children = Array.isArray(node.children)
          ? mapLinks(node.children, decide)
          : node.children
        if (decision === 'unlink') {
          changed = true
          out.push(...(Array.isArray(children) ? children : []))
          continue
        }
        if (decision !== 'keep') {
          changed = true
          out.push({
            ...node,
            children,
            ...(fields
              ? { fields: { ...fields, url: decision.href } }
              : { url: decision.href }),
          })
          continue
        }
        if (children !== node.children) {
          changed = true
          out.push({ ...node, children })
          continue
        }
        out.push(item)
        continue
      }
      const walked = mapLinks(item, decide)
      if (walked !== item) changed = true
      out.push(walked)
    }
    return (changed ? out : value) as T
  }

  if (value && typeof value === 'object') {
    let changed = false
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      const walked = mapLinks(item, decide)
      if (walked !== item) changed = true
      out[key] = walked
    }
    return (changed ? out : value) as T
  }

  return value
}

export type LinkContext = {
  locale: Locale
  siteUrl: string
  /** English slug → this language's slug, for articles live in both. */
  translated: Readonly<Record<string, string>>
  /** Slugs live in this language. */
  liveHere: ReadonlySet<string>
  /** English slugs of posts and pages that exist and are not live. */
  withheldEnglish: ReadonlySet<string>
}

/** Pure, for the tests: the decision for one href. */
export function decideLink(href: string, context: LinkContext): LinkDecision {
  let site: URL
  let url: URL
  try {
    site = new URL(context.siteUrl)
    url = new URL(href.trim(), site)
  } catch {
    return 'keep'
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'keep'
  if (bareHost(url.hostname) !== bareHost(site.hostname)) return 'keep'

  let segments: string[]
  try {
    segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    return 'keep'
  }

  // A link already in this language: fine if live there, text if not.
  if (segments.length === 2 && segments[0] === context.locale) {
    return context.liveHere.has(segments[1]!) ? 'keep' : 'unlink'
  }

  if (segments.length !== 1 || isPrefixedLocale(segments[0])) return 'keep'
  const english = segments[0]!
  const translated = context.translated[english]
  if (translated) {
    return { href: `/${context.locale}/${translated}/${url.search}${url.hash}` }
  }
  return context.withheldEnglish.has(english) ? 'unlink' : 'keep'
}

/** A translated body as a reader in that language should get it. */
export function localizeBodyLinks(
  body: ArticleBody,
  context: LinkContext,
): ArticleBody {
  if (body.kind !== 'lexical' || context.locale === DEFAULT_LOCALE) return body
  const content = mapLinks(body.content, (href) => decideLink(href, context))
  return content === body.content ? body : { kind: 'lexical', content }
}
