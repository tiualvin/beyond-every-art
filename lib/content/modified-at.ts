// The "last modified" date a post publishes, chosen from the dates it has.
//
// Separate from `content-updated.ts`, which decides when `contentUpdatedAt`
// moves, so the sitemap can choose a date without importing the Lexical
// plain-text machinery that decision needs.

export function toIso(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }
  if (typeof value !== 'string' || !value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * The date to publish as "last modified" for a post.
 *
 * `contentUpdatedAt` when the row has one, never earlier than `publishedAt` — a
 * piece edited while it was scheduled was not modified after it appeared.
 *
 * Null `contentUpdatedAt` means a row the backfill has not reached
 * (`scripts/backfill-content-updated-at.ts`), and falls back to `updatedAt`:
 * what every one of these dates said before this existed. Falling back to
 * `publishedAt` instead would move every recently edited article's `lastmod`
 * backwards on deploy day, which is the inaccurate-signal problem again in the
 * other direction. Every post published after this ships has a value from its
 * first publish, so the fallback only ever applies to rows older than it.
 */
export function contentModifiedAt(post: {
  contentUpdatedAt?: unknown
  updatedAt?: unknown
  publishedAt?: unknown
}): string | null {
  const published = toIso(post.publishedAt)
  const modified = toIso(post.contentUpdatedAt) ?? toIso(post.updatedAt)
  if (!modified) return published
  if (!published) return modified
  return modified > published ? modified : published
}
