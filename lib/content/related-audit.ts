// What the site as a whole links to from "Read next" and the house slots.
//
// One page's related list can look reasonable while the site's lists, taken
// together, all point at the same three articles — which is what the old
// newest-first query did, and nothing about any single page showed it. These
// numbers are the site-wide view: run by `pnpm audit:related` against the live
// archive, and by the tests against fixtures, so a ranking change that quietly
// re-concentrates the links fails somewhere a person will see.
//
// `legacyRelated` is the query this replaced, reproduced over the same
// candidates, so one run reports before and after side by side.

import type { RelatedCandidate, RelatedSubject } from './related-rank'
import { termsOf } from './related-rank'
import { isSubjectTag } from './topics'

/** A live post as the audit sees it: a candidate, and whether Ghost made it. */
export type AuditPost = RelatedCandidate & { migrated: boolean }

/** A strategy for choosing a page's pool: the old query or the new ranking. */
export type PickPool = (
  subject: RelatedSubject,
  candidates: AuditPost[],
  limit: number,
) => AuditPost[]

const byNewest = (a: RelatedCandidate, b: RelatedCandidate): number =>
  (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')

/**
 * The related query as it stood until October 2026.
 *
 * Posts sharing any of the page's tags, newest first; then, if that was short
 * of `limit`, the newest posts on the site that were not already chosen. Kept
 * so the audit can show what the change did on the same data, not so anything
 * can call it.
 */
export function legacyRelated<T extends RelatedCandidate>(
  subject: RelatedSubject,
  candidates: T[],
  limit: number,
): T[] {
  const others = candidates
    .filter((candidate) => candidate.slug !== subject.slug)
    .sort(byNewest)
  const wanted = new Set(subject.tags)
  const byTag = others
    .filter((candidate) => candidate.tags.some((tag) => wanted.has(tag)))
    .slice(0, limit)
  if (byTag.length >= limit) return byTag
  const chosen = new Set(byTag.map((candidate) => candidate.slug))
  return byTag.concat(
    others
      .filter((candidate) => !chosen.has(candidate.slug))
      .slice(0, limit - byTag.length),
  )
}

/**
 * The share of the archive above which a tag no longer says what a piece is
 * about. "Art" is on two thirds of the live archive and says nothing; the
 * Palette and Studio Notes shelves are each on about a fifth and say a good
 * deal. A quarter sits between them.
 */
export const NARROW_TAG_SHARE = 0.25

/** Tags carried by fewer than `NARROW_TAG_SHARE` of `posts`. */
export function narrowTags(posts: RelatedCandidate[]): Set<string> {
  const counts = new Map<string, number>()
  for (const post of posts) {
    for (const tag of new Set(post.tags)) {
      if (isSubjectTag(tag)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return new Set(
    [...counts]
      .filter(([, count]) => count < posts.length * NARROW_TAG_SHARE)
      .map(([tag]) => tag),
  )
}

/**
 * Whether two posts are about the same thing, as far as the audit can tell
 * without reading them: a meaningful word in common in the title or slug, or a
 * narrow tag in common. Deliberately the coarse question a reader would ask of
 * a "Read next" row — is this on my subject? — rather than the score the
 * ranking sorts on.
 */
export function sameTopic(
  a: RelatedCandidate,
  b: RelatedCandidate,
  narrow: Set<string>,
): boolean {
  const termsA = termsOf(a.slug, a.title)
  for (const term of termsOf(b.slug, b.title)) {
    if (termsA.has(term)) return true
  }
  return a.tags.some((tag) => narrow.has(tag) && b.tags.includes(tag))
}

export type RelatedAudit = {
  pages: number
  /** Different posts that appear in at least one "Read next" row. */
  readNextTargets: number
  /** Different posts that appear anywhere: "Read next" or a house slot. */
  poolTargets: number
  /** The posts shown in the most "Read next" rows, most first. */
  mostShown: Array<{ slug: string; pages: number; share: number }>
  /** The largest share of "Read next" rows any one post is in, 0–1. */
  maxShare: number
  /** Migrated articles in at least one "Read next" row. */
  migratedInReadNext: number
  /** Migrated articles anywhere: "Read next" or a house slot. */
  migratedInPool: number
  migratedTotal: number
  /** Pages whose "Read next" holds at least two same-topic pieces. */
  pagesWithTwoSameTopic: number
}

/**
 * The site-wide numbers for `pick`, over every post in `posts`.
 *
 * `readNextCount` and `poolSize` are the page's own — `READ_NEXT_COUNT` and
 * `RELATED_QUERY_LIMIT` from `related.ts` — passed in so this file depends on
 * the ranking and not on the ad layout.
 */
export function auditRelated(
  posts: AuditPost[],
  pick: PickPool,
  { readNextCount, poolSize }: { readNextCount: number; poolSize: number },
): RelatedAudit {
  const narrow = narrowTags(posts)
  const readNextCounts = new Map<string, number>()
  const inPool = new Set<string>()
  const inReadNext = new Set<string>()
  let pagesWithTwoSameTopic = 0

  for (const post of posts) {
    const pool = pick(
      { slug: post.slug, title: post.title, tags: post.tags },
      posts,
      poolSize,
    )
    const readNext = pool.slice(0, readNextCount)
    for (const item of pool) inPool.add(item.slug)
    for (const item of readNext) {
      inReadNext.add(item.slug)
      readNextCounts.set(item.slug, (readNextCounts.get(item.slug) ?? 0) + 1)
    }
    if (readNext.filter((item) => sameTopic(post, item, narrow)).length >= 2) {
      pagesWithTwoSameTopic += 1
    }
  }

  const migrated = new Set(
    posts.filter((post) => post.migrated).map((post) => post.slug),
  )
  const pages = posts.length
  const mostShown = [...readNextCounts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([slug, count]) => ({
      slug,
      pages: count,
      share: pages ? count / pages : 0,
    }))

  return {
    pages,
    readNextTargets: inReadNext.size,
    poolTargets: inPool.size,
    mostShown,
    maxShare: mostShown[0]?.share ?? 0,
    migratedInReadNext: [...inReadNext].filter((slug) => migrated.has(slug))
      .length,
    migratedInPool: [...inPool].filter((slug) => migrated.has(slug)).length,
    migratedTotal: migrated.size,
    pagesWithTwoSameTopic,
  }
}
