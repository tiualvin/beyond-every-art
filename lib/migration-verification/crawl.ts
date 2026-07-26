import { extractHtmlEvidence } from './html'
import type {
  CrawlOptions,
  CrawlResult,
  LinkEvidence,
  PageEvidence,
  RedirectHop,
} from './types'

export const DEFAULT_CRAWL_SEEDS = [
  '/',
  '/robots.txt',
  '/sitemap.xml',
  '/rss',
] as const

export const DEFAULT_CRAWL_OPTIONS: CrawlOptions = {
  concurrency: 4,
  maxPages: 500,
  maxRedirects: 8,
  maxResponseBytes: 2_000_000,
  requestTimeoutMs: 10_000,
  maxEvidencePerPage: 500,
  userAgent: 'BeyondEveryArt-MigrationVerifier/1.0',
}

export type FetchImplementation = typeof fetch

export interface CrawlAccessOptions {
  /** In-memory Authorization header. It is never copied into CrawlResult. */
  authorization?: string
}

function validateOrigin(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Origins must use http or https')
  }
  if (url.username || url.password) {
    throw new Error('Origins must not contain credentials')
  }
  url.pathname = '/'
  url.search = ''
  url.hash = ''
  return url
}

function validateOptions(options: CrawlOptions): void {
  const positiveIntegers: (keyof CrawlOptions)[] = [
    'concurrency',
    'maxPages',
    'maxRedirects',
    'maxResponseBytes',
    'requestTimeoutMs',
    'maxEvidencePerPage',
  ]
  for (const key of positiveIntegers) {
    const value = options[key]
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
      throw new Error(`${key} must be a positive integer`)
    }
  }
  const maximums: Partial<Record<keyof CrawlOptions, number>> = {
    concurrency: 32,
    maxPages: 10_000,
    maxRedirects: 20,
    maxResponseBytes: 10_000_000,
    requestTimeoutMs: 120_000,
    maxEvidencePerPage: 5_000,
  }
  for (const [key, maximum] of Object.entries(maximums)) {
    const value = options[key as keyof CrawlOptions]
    if (typeof value === 'number' && value > maximum) {
      throw new Error(`${key} must not exceed ${maximum}`)
    }
  }
}

function normalizeSeed(seed: string, origin: URL): string {
  const url = new URL(seed, origin)
  if (url.origin !== origin.origin) {
    throw new Error(`Seed is outside crawl origin: ${seed}`)
  }
  url.search = ''
  url.hash = ''
  return url.pathname || '/'
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel()
    return { text: '', truncated: true }
  }
  if (!response.body) return { text: '', truncated: false }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (length + value.byteLength > maxBytes) {
      await reader.cancel()
      return { text: '', truncated: true }
    }
    chunks.push(value)
    length += value.byteLength
  }
  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { text: new TextDecoder().decode(body), truncated: false }
}

function emptyPage(path: string, requestedUrl: string): PageEvidence {
  return {
    path,
    requestedUrl,
    finalUrl: requestedUrl,
    initialStatus: null,
    status: null,
    redirects: [],
    contentType: null,
    title: null,
    metaDescription: null,
    canonical: null,
    robots: [],
    h1: [],
    jsonLdTypes: [],
    links: [],
    images: [],
    evidenceTruncated: false,
    bodyTruncated: false,
    error: null,
  }
}

function evidenceUrl(
  value: string,
  base: URL,
  origin: URL,
  rel: string,
): LinkEvidence | null {
  try {
    const url = new URL(value.replaceAll('&amp;', '&'), base)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.hash = ''
    const internal = url.origin === origin.origin
    return {
      href: url.href,
      internal,
      path: internal ? url.pathname || '/' : null,
      rel: [rel],
    }
  } catch {
    return null
  }
}

function extractXmlLinks(
  xml: string,
  documentUrl: URL,
  origin: URL,
  maxEvidence: number,
): { links: LinkEvidence[]; truncated: boolean } {
  const links: LinkEvidence[] = []
  const seen = new Set<string>()
  const expression = /<loc\b[^>]*>([\s\S]*?)<\/loc>/gi
  let match: RegExpExecArray | null
  let truncated = false
  while ((match = expression.exec(xml))) {
    const link = evidenceUrl(match[1].trim(), documentUrl, origin, 'sitemap')
    if (!link || seen.has(link.href)) continue
    seen.add(link.href)
    if (links.length < maxEvidence) links.push(link)
    else truncated = true
  }
  return { links, truncated }
}

function extractRobotsEvidence(
  text: string,
  documentUrl: URL,
  origin: URL,
  maxEvidence: number,
): { directives: string[]; links: LinkEvidence[]; truncated: boolean } {
  const directives = new Set<string>()
  const links: LinkEvidence[] = []
  let truncated = false
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const separator = line.indexOf(':')
    const name = (separator >= 0 ? line.slice(0, separator) : line)
      .trim()
      .toLowerCase()
    const value = (separator >= 0 ? line.slice(separator + 1) : '')
      .trim()
      .replace(/\s+/g, ' ')
    directives.add(`${name}:${value}`)
    if (name !== 'sitemap') continue
    const link = evidenceUrl(value, documentUrl, origin, 'robots-sitemap')
    if (!link) continue
    if (links.length < maxEvidence) links.push(link)
    else truncated = true
  }
  return { directives: [...directives].sort(), links, truncated }
}

function errorName(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'request_timeout'
  }
  if (error instanceof Error) return `request_failed: ${error.message}`
  return 'request_failed'
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

async function crawlPage(
  path: string,
  origin: URL,
  options: CrawlOptions,
  fetchImplementation: FetchImplementation,
  access: CrawlAccessOptions,
): Promise<PageEvidence> {
  const requestedUrl = new URL(path, origin).href
  const page = emptyPage(path, requestedUrl)
  let current = new URL(requestedUrl)

  try {
    for (let redirectCount = 0; ; redirectCount += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(
        () => controller.abort(),
        options.requestTimeoutMs,
      )
      try {
        const response = await fetchImplementation(current, {
          headers: {
            accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
            'user-agent': options.userAgent,
            ...(access.authorization
              ? { authorization: access.authorization }
              : {}),
          },
          redirect: 'manual',
          signal: controller.signal,
        })

        if (page.initialStatus === null) page.initialStatus = response.status
        page.status = response.status
        page.finalUrl = current.href
        page.contentType = response.headers.get('content-type')

        if (REDIRECT_STATUSES.has(response.status)) {
          const location = response.headers.get('location')
          const next = location ? new URL(location, current) : null
          const nextUrl = next?.href ?? null
          const hop: RedirectHop = {
            url: current.href,
            status: response.status,
            location,
            nextUrl,
          }
          page.redirects.push(hop)
          await response.body?.cancel()
          if (!next) {
            page.error = 'redirect_missing_location'
            return page
          }
          if (next.origin !== origin.origin) {
            page.error = 'redirect_out_of_scope'
            return page
          }
          if (redirectCount >= options.maxRedirects) {
            page.error = 'redirect_limit_exceeded'
            return page
          }
          current = next
          continue
        }

        const contentType = page.contentType?.toLowerCase() ?? ''
        const isRobots = current.pathname === '/robots.txt'
        const isXml =
          contentType.includes('xml') || current.pathname.endsWith('.xml')
        const isHtml =
          contentType.includes('text/html') ||
          contentType.includes('application/xhtml+xml') ||
          (!contentType && !isRobots && !isXml)
        if (!isHtml && !isRobots && !isXml) {
          await response.body?.cancel()
          return page
        }
        const body = await readBoundedBody(response, options.maxResponseBytes)
        page.bodyTruncated = body.truncated
        if (body.truncated) {
          page.error = 'response_body_limit_exceeded'
          return page
        }
        if (isHtml) {
          const evidence = extractHtmlEvidence(
            body.text,
            current,
            origin.origin,
            options.maxEvidencePerPage,
          )
          Object.assign(page, evidence)
        } else if (isRobots) {
          const evidence = extractRobotsEvidence(
            body.text,
            current,
            origin,
            options.maxEvidencePerPage,
          )
          page.robots = evidence.directives
          page.links = evidence.links
          page.evidenceTruncated = evidence.truncated
        } else {
          const evidence = extractXmlLinks(
            body.text,
            current,
            origin,
            options.maxEvidencePerPage,
          )
          page.links = evidence.links
          page.evidenceTruncated = evidence.truncated
        }

        const headerRobots = response.headers.get('x-robots-tag')
        if (headerRobots) {
          page.robots = [
            ...new Set([
              ...page.robots,
              ...headerRobots
                .split(/[\s,]+/)
                .map((token) => token.toLowerCase())
                .filter(Boolean),
            ]),
          ].sort()
        }
        return page
      } finally {
        clearTimeout(timeout)
      }
    }
  } catch (error) {
    page.error = errorName(error)
    return page
  }
}

async function mapBounded<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let cursor = 0
  async function worker() {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      results[index] = await operation(values[index])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, worker),
  )
  return results
}

/**
 * Breadth-first, exact-origin crawler. Query strings and fragments are removed
 * to prevent unbounded faceted/session URL discovery. Each frontier is sorted
 * before the page limit is applied, making selection stable across runs even
 * though requests within a frontier are concurrent.
 */
export async function crawlSite(
  originValue: string,
  seeds: readonly string[] = DEFAULT_CRAWL_SEEDS,
  overrides: Partial<CrawlOptions> = {},
  fetchImplementation: FetchImplementation = fetch,
  access: CrawlAccessOptions = {},
): Promise<CrawlResult> {
  const origin = validateOrigin(originValue)
  const options = { ...DEFAULT_CRAWL_OPTIONS, ...overrides }
  validateOptions(options)
  const normalizedSeeds = [
    ...new Set(seeds.map((seed) => normalizeSeed(seed, origin))),
  ].sort()

  const seen = new Set<string>()
  const pages: PageEvidence[] = []
  let frontier = normalizedSeeds
  let discoveredBeyondLimit = false

  while (frontier.length > 0 && pages.length < options.maxPages) {
    const candidates = frontier.filter((path) => !seen.has(path)).sort()
    const remaining = options.maxPages - pages.length
    const selected = candidates.slice(0, remaining)
    if (selected.length < candidates.length) discoveredBeyondLimit = true
    for (const path of selected) seen.add(path)

    const levelPages = await mapBounded(selected, options.concurrency, (path) =>
      crawlPage(path, origin, options, fetchImplementation, access),
    )
    pages.push(...levelPages)

    const next = new Set<string>()
    for (const page of levelPages) {
      for (const link of page.links) {
        if (link.internal && link.path && !seen.has(link.path))
          next.add(link.path)
      }
    }
    frontier = [...next].sort()
  }

  if (frontier.some((path) => !seen.has(path))) discoveredBeyondLimit = true
  pages.sort((a, b) => a.path.localeCompare(b.path))
  return {
    origin: origin.origin,
    seeds: normalizedSeeds,
    options,
    pages,
    limitReached: discoveredBeyondLimit,
  }
}
