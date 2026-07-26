import type { ImageEvidence, LinkEvidence } from './types'

export interface HtmlEvidence {
  title: string | null
  metaDescription: string | null
  canonical: string | null
  robots: string[]
  h1: string[]
  jsonLdTypes: string[]
  links: LinkEvidence[]
  images: ImageEvidence[]
  evidenceTruncated: boolean
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
}

function decodeEntities(value: string): string {
  return value.replace(
    /&(#x[\da-f]+|#\d+|[a-z]+);/gi,
    (entity, key: string) => {
      if (key.startsWith('#x') || key.startsWith('#X')) {
        return String.fromCodePoint(Number.parseInt(key.slice(2), 16))
      }
      if (key.startsWith('#')) {
        return String.fromCodePoint(Number.parseInt(key.slice(1), 10))
      }
      return NAMED_ENTITIES[key.toLowerCase()] ?? entity
    },
  )
}

function textContent(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function attributes(value: string): Record<string, string> {
  const result: Record<string, string> = {}
  const expression =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match: RegExpExecArray | null
  while ((match = expression.exec(value))) {
    result[match[1].toLowerCase()] = decodeEntities(
      match[2] ?? match[3] ?? match[4] ?? '',
    )
  }
  return result
}

function firstText(html: string, tag: string): string | null {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(
    html,
  )
  if (!match) return null
  return textContent(match[1]) || null
}

function allText(html: string, tag: string): string[] {
  const values: string[] = []
  const expression = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  let match: RegExpExecArray | null
  while ((match = expression.exec(html))) {
    const value = textContent(match[1])
    if (value) values.push(value)
  }
  return values
}

function resolvedHttpUrl(value: string, base: URL): URL | null {
  try {
    const url = new URL(value, base)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.hash = ''
    return url
  } catch {
    return null
  }
}

function pathOf(url: URL): string {
  return url.pathname || '/'
}

function collectJsonLdTypes(value: unknown, output: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectJsonLdTypes(entry, output)
    return
  }
  if (!value || typeof value !== 'object') return
  const record = value as Record<string, unknown>
  const type = record['@type']
  if (typeof type === 'string') output.add(type)
  if (Array.isArray(type)) {
    for (const item of type) if (typeof item === 'string') output.add(item)
  }
  if ('@graph' in record) collectJsonLdTypes(record['@graph'], output)
}

/** Extract the SEO and navigation evidence needed by the migration comparator. */
export function extractHtmlEvidence(
  html: string,
  documentUrl: URL,
  scopeOrigin: string,
  maxEvidence: number,
): HtmlEvidence {
  const cleanHtml = html.replace(/<!--[\s\S]*?-->/g, '')
  let base = documentUrl
  const baseMatch = /<base\b([^>]*)>/i.exec(cleanHtml)
  if (baseMatch) {
    base =
      resolvedHttpUrl(attributes(baseMatch[1]).href ?? '', documentUrl) ?? base
  }

  let metaDescription: string | null = null
  const robots = new Set<string>()
  const metaExpression = /<meta\b([^>]*)>/gi
  let metaMatch: RegExpExecArray | null
  while ((metaMatch = metaExpression.exec(cleanHtml))) {
    const attrs = attributes(metaMatch[1])
    const name = attrs.name?.toLowerCase()
    if (name === 'description' && metaDescription === null) {
      metaDescription = attrs.content?.trim() || null
    }
    if (name === 'robots' || name === 'googlebot') {
      for (const token of (attrs.content ?? '').split(/[\s,]+/)) {
        if (token) robots.add(token.toLowerCase())
      }
    }
  }

  let canonical: string | null = null
  const linkTagExpression = /<link\b([^>]*)>/gi
  let linkTagMatch: RegExpExecArray | null
  while ((linkTagMatch = linkTagExpression.exec(cleanHtml))) {
    const attrs = attributes(linkTagMatch[1])
    const rel = (attrs.rel ?? '').toLowerCase().split(/\s+/)
    if (rel.includes('canonical') && canonical === null) {
      canonical = resolvedHttpUrl(attrs.href ?? '', base)?.href ?? null
    }
  }

  const links: LinkEvidence[] = []
  const linkKeys = new Set<string>()
  const anchorExpression = /<a\b([^>]*)>/gi
  let anchorMatch: RegExpExecArray | null
  let evidenceTruncated = false
  while ((anchorMatch = anchorExpression.exec(cleanHtml))) {
    const attrs = attributes(anchorMatch[1])
    const url = resolvedHttpUrl(attrs.href ?? '', base)
    if (!url) continue
    const rel = (attrs.rel ?? '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .sort()
    const internal = url.origin === scopeOrigin
    const evidence: LinkEvidence = {
      href: url.href,
      internal,
      path: internal ? pathOf(url) : null,
      rel,
    }
    const key = `${evidence.href}\0${rel.join(',')}`
    if (linkKeys.has(key)) continue
    linkKeys.add(key)
    if (links.length < maxEvidence) links.push(evidence)
    else evidenceTruncated = true
  }

  const images: ImageEvidence[] = []
  const imageKeys = new Set<string>()
  const imageExpression = /<img\b([^>]*)>/gi
  let imageMatch: RegExpExecArray | null
  while ((imageMatch = imageExpression.exec(cleanHtml))) {
    const attrs = attributes(imageMatch[1])
    const url = resolvedHttpUrl(attrs.src ?? attrs['data-src'] ?? '', base)
    if (!url) continue
    const evidence: ImageEvidence = {
      src: url.href,
      internal: url.origin === scopeOrigin,
      alt: Object.hasOwn(attrs, 'alt') ? attrs.alt.trim() : null,
    }
    const key = `${evidence.src}\0${evidence.alt ?? ''}`
    if (imageKeys.has(key)) continue
    imageKeys.add(key)
    if (images.length < maxEvidence) images.push(evidence)
    else evidenceTruncated = true
  }

  const jsonLdTypes = new Set<string>()
  const scriptExpression = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  let scriptMatch: RegExpExecArray | null
  while ((scriptMatch = scriptExpression.exec(cleanHtml))) {
    const attrs = attributes(scriptMatch[1])
    if (attrs.type?.toLowerCase() !== 'application/ld+json') continue
    try {
      collectJsonLdTypes(JSON.parse(scriptMatch[2]), jsonLdTypes)
    } catch {
      // Invalid JSON-LD is represented by the absence of types. The comparator
      // will expose a source/target difference without making parsing fatal.
    }
  }

  return {
    title: firstText(cleanHtml, 'title'),
    metaDescription,
    canonical,
    robots: [...robots].sort(),
    h1: allText(cleanHtml, 'h1'),
    jsonLdTypes: [...jsonLdTypes].sort(),
    links,
    images,
    evidenceTruncated,
  }
}
