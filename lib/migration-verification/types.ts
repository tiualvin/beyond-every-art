export interface RedirectHop {
  url: string
  status: number
  location: string | null
  nextUrl: string | null
}

export interface LinkEvidence {
  href: string
  internal: boolean
  path: string | null
  rel: string[]
}

export interface ImageEvidence {
  src: string
  internal: boolean
  alt: string | null
}

export interface PageEvidence {
  path: string
  requestedUrl: string
  finalUrl: string
  initialStatus: number | null
  status: number | null
  redirects: RedirectHop[]
  contentType: string | null
  title: string | null
  metaDescription: string | null
  canonical: string | null
  robots: string[]
  h1: string[]
  jsonLdTypes: string[]
  links: LinkEvidence[]
  images: ImageEvidence[]
  evidenceTruncated: boolean
  bodyTruncated: boolean
  error: string | null
}

export interface CrawlOptions {
  concurrency: number
  maxPages: number
  maxRedirects: number
  maxResponseBytes: number
  requestTimeoutMs: number
  maxEvidencePerPage: number
  userAgent: string
}

export interface CrawlResult {
  origin: string
  seeds: string[]
  options: CrawlOptions
  pages: PageEvidence[]
  limitReached: boolean
}

export type IssueSeverity = 'error' | 'warning'

export interface ComparisonIssue {
  severity: IssueSeverity
  code: string
  path: string
  field: string
  expected: unknown
  actual: unknown
  message: string
}

export interface ComparisonReport {
  ok: boolean
  sourceOrigin: string
  targetOrigin: string
  summary: {
    sourcePages: number
    targetPages: number
    comparedPages: number
    errors: number
    warnings: number
    sourceLimitReached: boolean
    targetLimitReached: boolean
  }
  issues: ComparisonIssue[]
  source: CrawlResult
  target: CrawlResult
}

export interface ComparisonOptions {
  /**
   * Staging intentionally emits noindex/nofollow. When enabled, compare all
   * other robots directives but ignore only indexing polarity on both sides.
   */
  allowTargetNoindex?: boolean
}
