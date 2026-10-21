// The decisions a processing run makes that do not need a PDF or a database:
// what to render and at what size, which pages a run has left to do, when an
// earlier run counts as abandoned, and what a page image is called.
//
// `docs/PUBLICATION_SYSTEM.md` ("PDF processing", "Processing state") is the
// brief; this is the part of it that can be tested with plain values.

import { createHash } from 'node:crypto'

/**
 * How pages are rendered. Bump `version` whenever anything here changes what
 * a page image looks like, so the next run redraws every page rather than
 * skipping the ones an earlier version already did.
 *
 * Each page is drawn once at `width` and stored as WebP; Payload derives the
 * smaller sizes from it (`collections/PublicationPageImages.ts`). There is no
 * zoom size yet: open decision 5 holds print-resolution images back until an
 * issue's image rights are known.
 */
export const RENDITION = {
  // 2: turned pages drawn at the rendition width (they were not, at 1).
  version: 2,
  width: 1600,
  quality: 82,
  sizes: [
    { name: 'thumbnail', width: 240 },
    { name: 'medium', width: 960 },
  ],
} as const

export const LIMITS = {
  /** Larger than any issue planned; a bound on a run, not a design target. */
  maxPages: 500,
  maxSourceBytes: 500 * 1024 * 1024,
  /**
   * A run updates its record after every page. One that has not done so for
   * this long was killed — at its memory limit, or by a deploy — and is
   * failed so a new run can start.
   */
  staleAfterMs: 15 * 60 * 1000,
} as const

/** Where the owner copies source PDFs in the media bucket (open decision 2). */
export const SOURCE_PREFIX = 'publication-sources/'

export type RunStatus =
  | 'downloading'
  | 'validating'
  | 'extracting-links'
  | 'processing-pages'
  | 'cleaning-up'
  | 'ready'
  | 'failed'

/** A run in one of these states may still be writing. */
export const ACTIVE_STATUSES: readonly RunStatus[] = [
  'downloading',
  'validating',
  'extracting-links',
  'processing-pages',
  'cleaning-up',
]

export function isActive(status: string | null | undefined): boolean {
  return ACTIVE_STATUSES.includes(status as RunStatus)
}

/** True when an active run has not reported progress within the window. */
export function isStale(
  run: { status?: string | null; updatedAt?: string | null },
  now: Date,
): boolean {
  if (!isActive(run.status)) return false
  const last = run.updatedAt ? Date.parse(run.updatedAt) : Number.NaN
  return !Number.isFinite(last) || now.getTime() - last > LIMITS.staleAfterMs
}

/**
 * Reads `--pages`: page numbers and ranges, comma separated, as in `3,5-7`.
 * Returns them sorted and deduplicated, or throws on anything else.
 */
export function parsePageSelection(value: string): number[] {
  const pages = new Set<number>()
  for (const part of value.split(',').map((piece) => piece.trim())) {
    const range = /^(\d+)(?:-(\d+))?$/.exec(part)
    if (!range) throw new Error(`"${part}" is not a page or a range like 5-7.`)
    const from = Number(range[1])
    const to = Number(range[2] ?? range[1])
    if (from < 1 || to < from)
      throw new Error(`"${part}" is not a range of pages from 1.`)
    // No issue has a page past the limit. Checked before the loop, because a
    // number past 2^53 rounds to one that `page++` cannot step past.
    if (to > LIMITS.maxPages)
      throw new Error(
        `"${part}" goes past page ${LIMITS.maxPages}, the most any issue may have.`,
      )
    for (let page = from; page <= to; page++) pages.add(page)
  }
  return [...pages].sort((a, b) => a - b)
}

export type ExistingPage = {
  pageNumber: number
  sourceSha256?: string | null
  rendition?: number | null
  status?: string | null
  /** The page image, by ID or populated; null once that image is deleted. */
  image?: unknown
}

/**
 * The pages this run has to draw.
 *
 * A page already drawn from the same file at the current rendition is skipped,
 * so running a failed run again resumes where it stopped instead of starting
 * over. `force` redraws the pages it names whatever their state — the way to
 * regenerate one bad page without reprocessing the issue.
 */
export function pagesToProcess(input: {
  pageCount: number
  sourceSha256: string
  existing: ExistingPage[]
  force?: number[] | 'all'
}): number[] {
  const { pageCount, sourceSha256, existing, force } = input
  const forced = force === 'all' ? null : new Set(force ?? [])
  const done = new Set(
    existing
      .filter(
        (page) =>
          page.status === 'ready' &&
          page.sourceSha256 === sourceSha256 &&
          page.rendition === RENDITION.version &&
          // An administrator can delete a page image, which leaves its page
          // ready and pointing at nothing; that page is not done.
          page.image !== null &&
          page.image !== undefined,
      )
      .map((page) => page.pageNumber),
  )
  const pages: number[] = []
  for (let page = 1; page <= pageCount; page++) {
    if (force === 'all' || forced?.has(page) || !done.has(page))
      pages.push(page)
  }
  return pages
}

/** Whole-number percent of pages done; 100 only when every page is. */
export function progressPercent(done: number, total: number): number {
  if (total <= 0) return 0
  if (done >= total) return 100
  return Math.min(99, Math.floor((done / total) * 100))
}

/**
 * A page image's file name: a hash of its bytes and the issue it belongs to.
 *
 * A redrawn page gets a new name, so its URL can be cached for a year without
 * ever serving the old image, and nothing ever has to purge Cloudflare
 * (`docs/PUBLICATION_SYSTEM.md`, "publication-assets"). Two identical pages of
 * one issue share an image; the same page in two issues does not, so clearing
 * out one issue's images can never take another's. The hash is truncated to
 * 128 bits, still far past the point where two images could collide.
 */
export function pageImageFilename(
  publication: string | number,
  bytes: Uint8Array,
): string {
  const hash = createHash('sha256')
    .update(`publication:${publication}\n`)
    .update(bytes)
  return `${hash.digest('hex').slice(0, 32)}.webp`
}
