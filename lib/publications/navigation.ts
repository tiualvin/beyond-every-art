// Where a reader is in a publication, as a URL, a label and a sentence.
//
// The reader, the transcript and every share link have to agree on what
// `?page=18` means, so it is decided once here. So are the two ways a position
// is shown — the "12–13 / 96" indicator a sighted reader glances at, and the
// sentence announced to assistive technology on every page change, which the
// brief requires (`docs/PUBLICATION_SYSTEM.md`, "Accessibility") — because the
// two describe the same spread and must not drift apart.

import { archivePagePath, parsePageParam } from '../content/pagination'
import { publicationReadPath } from '../seo/site'

import type { ReadingDirection, Spread } from './spreads'

/**
 * The page a `?page=` parameter asks for.
 *
 * Read with the journal's own parser, so junk degrades to the first page the
 * same way an archive URL does. A number past the end lands on the last page
 * rather than the first: somebody who followed a link to page 120 of an issue
 * that was reprocessed down to 96 pages wants the end of it, not the cover.
 */
export function readerPageParam(
  value: string | string[] | undefined | null,
  pageCount: number,
): number {
  const last = Number.isFinite(pageCount)
    ? Math.max(1, Math.floor(pageCount))
    : 1
  return Math.min(parsePageParam(value), last)
}

/**
 * The reader's URL, opened at a page.
 *
 * Page 1 is the bare path, so the reader has one URL for its default state
 * rather than two — the same rule `archivePagePath` applies to the journal.
 * Transcript pages link into the reader through this.
 */
export function readerPagePath(slug: string, page: number): string {
  return archivePagePath(publicationReadPath(slug), page)
}

/** The visible position, e.g. `12–13 / 96` or `1 / 96`. */
export function pageIndicator(spread: Spread, pageCount: number): string {
  const first = Math.min(...spread.pages)
  const last = Math.max(...spread.pages)
  const pages = first === last ? `${first}` : `${first}–${last}`
  return `${pages} / ${pageCount}`
}

/**
 * The sentence announced when the reader moves, e.g. `Pages 12 and 13 of 96`.
 *
 * Written out rather than reusing the indicator, because a screen reader reads
 * `12–13 / 96` as "twelve dash thirteen slash ninety-six".
 */
export function pageAnnouncement(spread: Spread, pageCount: number): string {
  const first = Math.min(...spread.pages)
  const last = Math.max(...spread.pages)
  return first === last
    ? `Page ${first} of ${pageCount}`
    : `Pages ${first} and ${last} of ${pageCount}`
}

/**
 * How far an arrow key moves, in spreads: `1` forward, `-1` back, `0` for any
 * other key.
 *
 * The arrow names a direction on screen, not in the publication. In a
 * right-to-left issue the next page is to the left, so the left arrow moves
 * forward — which is what someone holding the printed copy would expect.
 */
export function arrowStep(
  key: string,
  direction: ReadingDirection,
): -1 | 0 | 1 {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return 0
  const towardsRight = key === 'ArrowRight'
  return towardsRight === (direction === 'ltr') ? 1 : -1
}

/** The spread `delta` steps from `index`, held inside the publication. */
export function stepSpread(
  index: number,
  delta: number,
  total: number,
): number {
  if (!Number.isFinite(total) || total < 1) return 0
  const from = Number.isFinite(index) ? Math.floor(index) : 0
  const step = Number.isFinite(delta) ? Math.trunc(delta) : 0
  const target = from + step
  return Math.min(Math.max(0, target), Math.floor(total) - 1)
}
