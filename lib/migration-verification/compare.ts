import type {
  ComparisonIssue,
  ComparisonOptions,
  ComparisonReport,
  CrawlResult,
  IssueSeverity,
  PageEvidence,
} from './types'

function normalizedText(value: string | null): string | null {
  return value?.replace(/\s+/g, ' ').trim() || null
}

function semanticUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return `${url.pathname}${url.search}`
  } catch {
    return value
  }
}

function isSuccess(status: number | null): boolean {
  return status !== null && status >= 200 && status < 300
}

function indexPages(crawl: CrawlResult): Map<string, PageEvidence> {
  return new Map(crawl.pages.map((page) => [page.path, page]))
}

function addIssue(
  issues: ComparisonIssue[],
  severity: IssueSeverity,
  code: string,
  path: string,
  field: string,
  expected: unknown,
  actual: unknown,
  message: string,
): void {
  issues.push({ severity, code, path, field, expected, actual, message })
}

function compareField(
  issues: ComparisonIssue[],
  path: string,
  code: string,
  field: string,
  source: unknown,
  target: unknown,
  severity: IssueSeverity,
): void {
  if (JSON.stringify(source) === JSON.stringify(target)) return
  addIssue(
    issues,
    severity,
    code,
    path,
    field,
    source,
    target,
    `${field} differs between source and target`,
  )
}

function comparePage(
  source: PageEvidence,
  target: PageEvidence | undefined,
  sourceOrigin: string,
  targetOrigin: string,
  targetPages: Map<string, PageEvidence>,
  issues: ComparisonIssue[],
  options: ComparisonOptions,
): void {
  const path = source.path
  if (!target) {
    addIssue(
      issues,
      'error',
      'target_url_missing',
      path,
      'status',
      source.status,
      null,
      'Source URL was not crawled on the target',
    )
    return
  }
  if (source.error) {
    addIssue(
      issues,
      'error',
      'source_crawl_error',
      path,
      'error',
      null,
      source.error,
      'Source URL could not be verified reliably',
    )
  }
  if (target.error) {
    addIssue(
      issues,
      'error',
      'target_crawl_error',
      path,
      'error',
      null,
      target.error,
      'Target URL could not be verified reliably',
    )
  }
  if (source.evidenceTruncated) {
    addIssue(
      issues,
      'error',
      'source_evidence_limit_reached',
      path,
      'evidenceTruncated',
      false,
      true,
      'Source page exceeded the link/image evidence cap; crawl coverage may be incomplete',
    )
  }
  if (target.evidenceTruncated) {
    addIssue(
      issues,
      'warning',
      'target_evidence_limit_reached',
      path,
      'evidenceTruncated',
      false,
      true,
      'Target page exceeded the link/image evidence cap',
    )
  }

  if (isSuccess(source.status) && !isSuccess(target.status)) {
    addIssue(
      issues,
      'error',
      'unexpected_target_status',
      path,
      'status',
      source.status,
      target.status,
      'Successful source URL does not resolve successfully on the target',
    )
  } else if (source.status !== target.status) {
    compareField(
      issues,
      path,
      'status_changed',
      'status',
      source.status,
      target.status,
      'warning',
    )
  }

  const temporaryRedirect = target.redirects.find((hop) =>
    [302, 303, 307].includes(hop.status),
  )
  if (temporaryRedirect) {
    addIssue(
      issues,
      'error',
      'temporary_target_redirect',
      path,
      'redirects',
      '301 or 308',
      temporaryRedirect.status,
      'Target migration redirect is not permanent',
    )
  }

  compareField(
    issues,
    path,
    'title_changed',
    'title',
    normalizedText(source.title),
    normalizedText(target.title),
    'error',
  )
  compareField(
    issues,
    path,
    'meta_description_changed',
    'metaDescription',
    normalizedText(source.metaDescription),
    normalizedText(target.metaDescription),
    'error',
  )
  compareField(
    issues,
    path,
    'canonical_changed',
    'canonical',
    semanticUrl(source.canonical),
    semanticUrl(target.canonical),
    'error',
  )
  const indexingDirectives = new Set(['follow', 'index', 'nofollow', 'noindex'])
  const sourceRobots = options.allowTargetNoindex
    ? source.robots.filter((directive) => !indexingDirectives.has(directive))
    : source.robots
  const targetRobots = options.allowTargetNoindex
    ? target.robots.filter((directive) => !indexingDirectives.has(directive))
    : target.robots
  compareField(
    issues,
    path,
    'robots_changed',
    'robots',
    sourceRobots,
    targetRobots,
    sourceRobots.includes('noindex') || !targetRobots.includes('noindex')
      ? 'warning'
      : 'error',
  )
  compareField(
    issues,
    path,
    'h1_changed',
    'h1',
    source.h1.map(normalizedText),
    target.h1.map(normalizedText),
    'warning',
  )
  compareField(
    issues,
    path,
    'structured_data_types_changed',
    'jsonLdTypes',
    source.jsonLdTypes,
    target.jsonLdTypes,
    'warning',
  )

  if (target.canonical) {
    try {
      if (new URL(target.canonical).origin !== targetOrigin) {
        addIssue(
          issues,
          'error',
          'target_canonical_off_origin',
          path,
          'canonical',
          targetOrigin,
          target.canonical,
          'Target canonical points away from the target origin',
        )
      }
    } catch {
      // extractHtmlEvidence only emits valid absolute canonicals.
    }
  }

  if (source.images.length > 0 && target.images.length === 0) {
    addIssue(
      issues,
      'error',
      'images_lost',
      path,
      'images',
      source.images.length,
      0,
      'Source page has images but target page has none',
    )
  }
  const sourceMissingAlt = source.images.filter(
    (image) => image.alt === null || image.alt === '',
  ).length
  const targetMissingAlt = target.images.filter(
    (image) => image.alt === null || image.alt === '',
  ).length
  if (targetMissingAlt > sourceMissingAlt) {
    addIssue(
      issues,
      'error',
      'image_alt_regression',
      path,
      'images.alt',
      sourceMissingAlt,
      targetMissingAlt,
      'Target page has more images without alt text than the source',
    )
  }
  const legacyImages = target.images
    .filter((image) => new URL(image.src).origin === sourceOrigin)
    .map((image) => image.src)
    .sort()
  if (legacyImages.length > 0) {
    addIssue(
      issues,
      'error',
      'legacy_image_hotlink',
      path,
      'images.src',
      [],
      legacyImages,
      'Target page still loads image media from the source origin',
    )
  }

  const legacyLinks = target.links
    .filter((link) => new URL(link.href).origin === sourceOrigin)
    .map((link) => link.href)
    .sort()
  if (legacyLinks.length > 0) {
    addIssue(
      issues,
      'warning',
      'legacy_origin_link',
      path,
      'links.href',
      [],
      legacyLinks,
      'Target page still links to the source origin',
    )
  }

  const brokenLinks = target.links
    .filter((link) => link.internal && link.path)
    .map((link) => link.path as string)
    .filter((linkPath) => {
      const linkedPage = targetPages.get(linkPath)
      return linkedPage && !isSuccess(linkedPage.status)
    })
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort()
  if (brokenLinks.length > 0) {
    addIssue(
      issues,
      'error',
      'broken_internal_links',
      path,
      'links',
      [],
      brokenLinks,
      'Target page links to crawled URLs that do not resolve successfully',
    )
  }
}

/** Pure, deterministic comparison of two already captured crawl results. */
export function compareCrawls(
  source: CrawlResult,
  target: CrawlResult,
  options: ComparisonOptions = {},
): ComparisonReport {
  const sourcePages = indexPages(source)
  const targetPages = indexPages(target)
  const issues: ComparisonIssue[] = []

  for (const path of [...sourcePages.keys()].sort()) {
    comparePage(
      sourcePages.get(path)!,
      targetPages.get(path),
      source.origin,
      target.origin,
      targetPages,
      issues,
      options,
    )
  }

  if (source.limitReached) {
    addIssue(
      issues,
      'error',
      'source_page_limit_reached',
      '/',
      'crawl.limitReached',
      false,
      true,
      'Source crawl hit maxPages; comparison is incomplete',
    )
  }
  if (target.limitReached) {
    addIssue(
      issues,
      'warning',
      'target_page_limit_reached',
      '/',
      'crawl.limitReached',
      false,
      true,
      'Target crawl hit maxPages; target-only discovery may be incomplete',
    )
  }

  issues.sort(
    (a, b) =>
      a.path.localeCompare(b.path) ||
      a.severity.localeCompare(b.severity) ||
      a.code.localeCompare(b.code) ||
      a.field.localeCompare(b.field),
  )
  const errors = issues.filter((issue) => issue.severity === 'error').length
  const warnings = issues.length - errors
  return {
    ok: errors === 0,
    sourceOrigin: source.origin,
    targetOrigin: target.origin,
    summary: {
      sourcePages: source.pages.length,
      targetPages: target.pages.length,
      comparedPages: source.pages.length,
      errors,
      warnings,
      sourceLimitReached: source.limitReached,
      targetLimitReached: target.limitReached,
    },
    issues,
    source,
    target,
  }
}
