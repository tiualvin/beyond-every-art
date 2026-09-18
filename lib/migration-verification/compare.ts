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

function normalizedRobotsDirective(directive: string): string {
  const separator = directive.indexOf(':')
  if (separator < 0) return directive
  const name = directive.slice(0, separator)
  const value = directive.slice(separator + 1)
  if (name !== 'sitemap') return directive
  return `sitemap:${semanticUrl(value) ?? value}`
}

function comparableRobots(
  directives: string[],
  allowTargetNoindex: boolean,
): string[] {
  const intentionalStagingDirectives = new Set([
    'follow',
    'index',
    'nofollow',
    'noindex',
    'disallow:',
    'disallow:/',
  ])
  return directives
    .map(normalizedRobotsDirective)
    .filter(
      (directive) =>
        !allowTargetNoindex || !intentionalStagingDirectives.has(directive),
    )
    .sort()
}

function redirectSignature(hop: PageEvidence['redirects'][number]): string {
  return `${semanticUrl(hop.url)}\0${hop.status}\0${semanticUrl(hop.nextUrl)}`
}

function newlyIntroducedTemporaryRedirect(
  source: PageEvidence,
  target: PageEvidence,
): PageEvidence['redirects'][number] | undefined {
  const preservedSourceRedirects = new Map<string, number>()
  for (const hop of source.redirects) {
    if (![302, 303, 307].includes(hop.status)) continue
    const signature = redirectSignature(hop)
    preservedSourceRedirects.set(
      signature,
      (preservedSourceRedirects.get(signature) ?? 0) + 1,
    )
  }
  for (const hop of target.redirects) {
    if (![302, 303, 307].includes(hop.status)) continue
    const signature = redirectSignature(hop)
    const preservedCount = preservedSourceRedirects.get(signature) ?? 0
    if (preservedCount === 0) return hop
    preservedSourceRedirects.set(signature, preservedCount - 1)
  }
  return undefined
}

function isSuccess(status: number | null): boolean {
  return status !== null && status >= 200 && status < 300
}

function indexPages(crawl: CrawlResult): Map<string, PageEvidence> {
  return new Map(crawl.pages.map((page) => [page.path, page]))
}

/** A site's chrome needs enough pages under it before "on every page" means anything. */
const CHROME_MIN_PAGES = 5
/** Present on at least this share of pages is chrome rather than content. */
const CHROME_SHARE = 0.9

/**
 * The image sources that belong to the template rather than to any one page —
 * a masthead wordmark, a footer mark, a default avatar.
 *
 * This exists because counting a page's images without it measures the theme.
 * `images_lost` asks whether a page has *no* images, and on 18 Sep a masthead
 * wordmark (#159) put one on every page of the target, which made the question
 * unanswerable sitewide: the check could no longer fire however much a page had
 * lost. Subtracting what appears everywhere leaves the images the page is
 * actually about, and the comparison survives either side restyling its
 * template.
 */
function sitewideImageSrcs(pages: Map<string, PageEvidence>): Set<string> {
  const rendered = [...pages.values()].filter(
    (page) => page.error === null && isSuccess(page.status),
  )
  // Below this, "on nearly every page" describes the crawl rather than the
  // template, and subtracting it would hide real content.
  if (rendered.length < CHROME_MIN_PAGES) return new Set()

  const counts = new Map<string, number>()
  for (const page of rendered) {
    for (const src of new Set(page.images.map((image) => image.src))) {
      counts.set(src, (counts.get(src) ?? 0) + 1)
    }
  }

  const threshold = rendered.length * CHROME_SHARE
  return new Set(
    [...counts].filter(([, count]) => count >= threshold).map(([src]) => src),
  )
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
  chrome: { source: Set<string>; target: Set<string> },
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

  const temporaryRedirect = newlyIntroducedTemporaryRedirect(source, target)
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
  const sourceRobots = comparableRobots(
    source.robots,
    options.allowTargetNoindex ?? false,
  )
  const targetRobots = comparableRobots(
    target.robots,
    options.allowTargetNoindex ?? false,
  )
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
  } else {
    // The all-or-nothing check above cannot see a page that kept one image and
    // lost nine, and cannot fire at all once either side puts an image in its
    // template. Comparing what is left after the chrome is subtracted does see
    // it. A warning rather than an error: the two sides are different themes,
    // so a difference of one is ordinary and only an eye can judge the rest.
    const sourceContent = source.images.filter(
      (image) => !chrome.source.has(image.src),
    ).length
    const targetContent = target.images.filter(
      (image) => !chrome.target.has(image.src),
    ).length
    if (sourceContent > 0 && targetContent < sourceContent) {
      addIssue(
        issues,
        'warning',
        'images_reduced',
        path,
        'images',
        sourceContent,
        targetContent,
        'Target page has fewer content images than the source page',
      )
    }
  }
  // alt="" is valid for decorative images; only a missing attribute regresses
  // accessibility evidence.
  const sourceMissingAlt = source.images.filter(
    (image) => image.alt === null,
  ).length
  const targetMissingAlt = target.images.filter(
    (image) => image.alt === null,
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
  // Computed once per side: what is on nearly every page is the template.
  const chrome = {
    source: sitewideImageSrcs(sourcePages),
    target: sitewideImageSrcs(targetPages),
  }

  for (const path of [...sourcePages.keys()].sort()) {
    comparePage(
      sourcePages.get(path)!,
      targetPages.get(path),
      source.origin,
      target.origin,
      targetPages,
      chrome,
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
