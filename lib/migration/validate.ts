// Pure post-import validation: compare what the migration plan says should
// exist against what actually landed in Payload. Keeping the comparison free of
// I/O makes it unit-testable; scripts/validate-migration.ts queries Payload and
// feeds the results in.
//
// Everything is keyed on the Ghost ID, the idempotent external identifier, so a
// slug or title change never hides a missing or mismatched record.

import type { ContentStatus } from './plan'

export interface ExpectedContent {
  ghostID: string
  slug: string
  status: ContentStatus
  hasFeatureImage: boolean
  publishedAt?: string
  metaTitle?: string
  metaDescription?: string
  canonicalURL?: string
  excerpt?: string
}

export interface ActualContent {
  ghostID: string
  slug: string
  status: ContentStatus
  hasFeatureImage: boolean
  publishedAt?: string
  metaTitle?: string
  metaDescription?: string
  canonicalURL?: string
  excerpt?: string
}

export interface ExpectedRef {
  ghostID: string
  slug: string
}

export interface ActualRef {
  ghostID: string
  slug: string
}

export type IssueField =
  | 'missing'
  | 'slug'
  | 'status'
  | 'featureImage'
  | 'publishedAt'
  | 'metaTitle'
  | 'metaDescription'
  | 'canonicalURL'
  | 'excerpt'

/**
 * The text fields the acceptance criteria require to survive the migration:
 * "SEO titles and descriptions are retained" and "canonical URLs are correct".
 * The importer writes them, so a silent loss here is invisible until a crawler
 * reports it.
 */
const TEXT_FIELDS = [
  'metaTitle',
  'metaDescription',
  'canonicalURL',
  'excerpt',
] as const satisfies readonly IssueField[]

export interface ValidationIssue {
  ghostID: string
  slug: string
  field: IssueField
  expected: unknown
  actual: unknown
}

export interface CollectionReport {
  expected: number
  actual: number
  matched: number
  issues: ValidationIssue[]
}

function indexByGhostID<T extends { ghostID: string }>(
  items: T[],
): Map<string, T> {
  const map = new Map<string, T>()
  for (const item of items) map.set(item.ghostID, item)
  return map
}

/** Two dates are equal if they resolve to the same instant (format-agnostic). */
function sameInstant(a?: string, b?: string): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b
  return ta === tb
}

/** Blank, whitespace-only, and absent are the same thing in a text field. */
function text(value?: string): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * Validate posts or pages. Reports every expected record missing from Payload
 * and every field that drifted: slug, draft/published status, loss of a feature
 * image, a changed publication date, or an SEO field the export set and the
 * import failed to preserve.
 */
export function validateContent(
  expected: ExpectedContent[],
  actual: ActualContent[],
): CollectionReport {
  const actualByID = indexByGhostID(actual)
  const issues: ValidationIssue[] = []
  let matched = 0

  for (const item of expected) {
    const found = actualByID.get(item.ghostID)
    if (!found) {
      issues.push({
        ghostID: item.ghostID,
        slug: item.slug,
        field: 'missing',
        expected: item.slug,
        actual: null,
      })
      continue
    }
    matched += 1

    if (found.slug !== item.slug) {
      issues.push({
        ghostID: item.ghostID,
        slug: item.slug,
        field: 'slug',
        expected: item.slug,
        actual: found.slug,
      })
    }
    if (found.status !== item.status) {
      issues.push({
        ghostID: item.ghostID,
        slug: item.slug,
        field: 'status',
        expected: item.status,
        actual: found.status,
      })
    }
    // Only flag a lost feature image, never a gained one.
    if (item.hasFeatureImage && !found.hasFeatureImage) {
      issues.push({
        ghostID: item.ghostID,
        slug: item.slug,
        field: 'featureImage',
        expected: true,
        actual: false,
      })
    }
    if (!sameInstant(item.publishedAt, found.publishedAt)) {
      issues.push({
        ghostID: item.ghostID,
        slug: item.slug,
        field: 'publishedAt',
        expected: item.publishedAt ?? null,
        actual: found.publishedAt ?? null,
      })
    }

    // Same rule as the feature image: a value Ghost never had is not a
    // migration failure. This runs against production after the final import,
    // where an editor may already have filled in a description Ghost left
    // empty, and flagging that would train everyone to ignore the report.
    for (const field of TEXT_FIELDS) {
      const want = text(item[field])
      if (!want) continue
      const got = text(found[field])
      if (got === want) continue
      issues.push({
        ghostID: item.ghostID,
        slug: item.slug,
        field,
        expected: want,
        actual: got ?? null,
      })
    }
  }

  return {
    expected: expected.length,
    actual: actual.length,
    matched,
    issues,
  }
}

/**
 * Validate reference collections (tags, authors): every expected record must be
 * present with its slug preserved.
 */
export function validateRefs(
  expected: ExpectedRef[],
  actual: ActualRef[],
): CollectionReport {
  const actualByID = indexByGhostID(actual)
  const issues: ValidationIssue[] = []
  let matched = 0

  for (const item of expected) {
    const found = actualByID.get(item.ghostID)
    if (!found) {
      issues.push({
        ghostID: item.ghostID,
        slug: item.slug,
        field: 'missing',
        expected: item.slug,
        actual: null,
      })
      continue
    }
    matched += 1
    if (found.slug !== item.slug) {
      issues.push({
        ghostID: item.ghostID,
        slug: item.slug,
        field: 'slug',
        expected: item.slug,
        actual: found.slug,
      })
    }
  }

  return { expected: expected.length, actual: actual.length, matched, issues }
}

/** True when a set of collection reports contains no discrepancies. */
export function isClean(reports: CollectionReport[]): boolean {
  return reports.every((report) => report.issues.length === 0)
}
