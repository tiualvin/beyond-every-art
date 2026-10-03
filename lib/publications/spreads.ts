// How the pages of a publication sit side by side.
//
// A printed issue is bound, so every page has a side: the front cover is a
// right-hand page, the page after it is a left-hand one, and a two-page view
// that ignores this puts every facing pair one page out of step — the left
// half of a double-page photograph opposite the right half of the next one.
// That is the bug this module exists to make impossible, and it is pure
// arithmetic, so it lives here rather than in the reader: the route supplies a
// page count and the publication's settings, and this decides the pairing.
//
// Three settings decide it, all stored on the publication
// (`docs/PUBLICATION_SYSTEM.md`, "Page display and spreads"):
//
// - `firstPageIsCover` — page 1 stands alone and pairs start at 2–3. Without
//   it, pairs start at 1–2, which is how a PDF exported as spreads with no
//   cover reads.
// - `readingDirection` — right-to-left mirrors every spread: the earlier page
//   of a pair is on the right, and the cover sits on the left.
// - `layout` — `single` shows one page at a time and pairs nothing. The mobile
//   reader always uses it; the brief forbids a two-page spread on a phone.
//
// A page with no partner keeps its side rather than being centred, because
// which side it is on is information: a lone first page is a cover, a lone last
// page is a back cover. `slots` carries that as an explicit empty half, so the
// renderer draws the same two columns for every spread and nothing jumps.

export type ReadingDirection = 'ltr' | 'rtl'

export type PageLayout = 'spread' | 'single'

export type SpreadOptions = {
  pageCount: number
  firstPageIsCover: boolean
  readingDirection: ReadingDirection
  layout: PageLayout
}

export type Spread = {
  /** Position in reading order, from 0. */
  index: number
  /** The pages shown, in reading order. Never empty. */
  pages: number[]
  /**
   * The same pages as they sit on screen, left to right. Two entries in the
   * spread layout, where `null` is a half with no page in it; one entry in the
   * single layout.
   */
  slots: (number | null)[]
}

/**
 * A page count the arithmetic below can trust.
 *
 * The count arrives from a processing run, so a bad one is a bug upstream —
 * but a reader that throws is a blank page for every visitor, and one that
 * shows nothing for a corrupt count is merely empty. Clamped the same way
 * `buildPagination` clamps its total.
 */
function safeCount(pageCount: number): number {
  return Number.isFinite(pageCount) ? Math.max(0, Math.floor(pageCount)) : 0
}

/** The page clamped into the publication, or 1 when there is nothing to clamp to. */
function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page)) return 1
  return Math.min(Math.max(1, Math.floor(page)), Math.max(1, pageCount))
}

/** How many spreads a publication has in the given layout. */
export function spreadCount(options: SpreadOptions): number {
  const count = safeCount(options.pageCount)
  if (count === 0) return 0
  if (options.layout === 'single') return count
  // With a cover: the cover alone, then one spread per pair of pages after it.
  // A lone back cover is the remainder of that division and needs no rounding.
  return options.firstPageIsCover
    ? 1 + Math.floor(count / 2)
    : Math.ceil(count / 2)
}

/** Which spread a page is on. Out-of-range pages land on the nearest one. */
export function spreadIndexOf(page: number, options: SpreadOptions): number {
  const count = safeCount(options.pageCount)
  if (count === 0) return 0
  const current = clampPage(page, count)
  if (options.layout === 'single') return current - 1
  return options.firstPageIsCover
    ? Math.floor(current / 2)
    : Math.floor((current - 1) / 2)
}

/**
 * One spread by its index, or `null` when the publication has no such spread.
 *
 * Every spread is a nominal pair — `first` and the page after it — with any
 * page outside the publication left empty. In the cover layout spread 0 is the
 * pair (0, 1), and page 0 does not exist, which is how the cover comes to stand
 * alone on the right without a special case.
 */
export function spreadAt(index: number, options: SpreadOptions): Spread | null {
  const count = safeCount(options.pageCount)
  if (!Number.isInteger(index) || index < 0 || index >= spreadCount(options)) {
    return null
  }

  if (options.layout === 'single') {
    return { index, pages: [index + 1], slots: [index + 1] }
  }

  const first = options.firstPageIsCover ? index * 2 : index * 2 + 1
  const inRange = (page: number): number | null =>
    page >= 1 && page <= count ? page : null

  const earlier = inRange(first)
  const later = inRange(first + 1)
  const pages = [earlier, later].filter((page): page is number => page !== null)

  // Left to right on screen. A right-to-left publication is read from the
  // right-hand page first, so its earlier page goes on the right.
  const slots =
    options.readingDirection === 'rtl' ? [later, earlier] : [earlier, later]

  return { index, pages, slots }
}

/** The spread a page is on. Out-of-range pages land on the nearest one. */
export function spreadForPage(
  page: number,
  options: SpreadOptions,
): Spread | null {
  return spreadAt(spreadIndexOf(page, options), options)
}

/** Every spread, in reading order. */
export function buildSpreads(options: SpreadOptions): Spread[] {
  const spreads: Spread[] = []
  const total = spreadCount(options)
  for (let index = 0; index < total; index += 1) {
    spreads.push(spreadAt(index, options)!)
  }
  return spreads
}
