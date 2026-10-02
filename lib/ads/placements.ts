// Where an ad unit may go, by name, and what shape it is there.
//
// The names are the public contract and the ids behind them are not, which is
// the whole point of the indirection: `docs/ADVERTISING.md` §5 asks for a name
// for what a slot *is*, never for what fills it, the same way `BLOCK_SLUGS` in
// `blocks/schema.ts` names a block rather than its renderer. A component asks
// for `rail-1`; that it is an AdSense slot today and some managed partner's
// unit at the traffic thresholds in §6 is a fact this file keeps to itself.
//
// The inventory in §8 has five placements and three of them are not built.
// They are deliberately not listed here either — a name with no call site is a
// name nobody has had to make work, and the split rule the in-body unit needed
// (§4) was a piece of real work rather than a table row.

/**
 * The box a placement reserves, and how AdSense is asked to fill it.
 *
 * Three shapes, because the live placements are genuinely different units.
 * A `fixed` slot is a display unit of a known size and reserves exactly that.
 * A `fluid` slot is one of Google's in-article units, whose height depends on
 * the creative — so there is nothing exact to reserve, and `reserve` is a
 * floor chosen to cover the common case rather than a promise. A `responsive`
 * slot is Google's auto-sized display unit: it serves 970x250 on a desktop and
 * 300x250 on a phone from one id, so its height is a single number rather than
 * a size to pin. §8's "reserve the maximum, always" cannot be honoured by a
 * format that has no maximum; the honest version is to say so here rather than
 * to pretend.
 */
export type SlotSize =
  | { kind: 'fixed'; width: number; height: number }
  | { kind: 'fluid'; layout: 'in-article'; reserve: number }
  | { kind: 'responsive'; reserve: number }

/**
 * AdSense slot ids, by placement.
 *
 * These are per-unit ids created in the AdSense console against the publisher
 * in `lib/ads/adsense.ts`. A slot id belonging to a different publisher does
 * not error, it simply never fills, so the two travel together and
 * `tests/ads/placements.test.ts` pins their shape.
 */
export const AD_SLOTS = {
  /** Rail, `/[slug]`: above the newsletter card, inside the sticky pair. */
  'rail-1': '3235264856',
  /**
   * Text, `/[slug]`: down the body — see `lib/ads/inline.ts`.
   *
   * Three ids rather than one, and the reason is measurement rather than
   * serving. The same unit code may be repeated on a page and every `<ins>`
   * still fills, so one id would serve all six slots — but AdSense then
   * reports the six positions as one row, and the question this archive has
   * to answer is which of them fills at all. Coverage is the number that
   * decides it, and it cannot be read per position from a single unit.
   * `docs/ADVERTISING.md` §8 records the reversal: `article-inline-2` and
   * `-3` were retired as names while there was one unit, and are back as units
   * now that per-position fill is what is being measured. Positions past the
   * third share `-3`, so the tail is one row rather than four.
   */
  'article-inline-1': '5370387884',
  'article-inline-2': '2038101782',
  'article-inline-3': '1251633721',
  /** Block, `/[slug]`: below the author card, above "Read next". */
  'article-end': '9771363986',
  /** Listing — journal, tag: after every sixth entry. */
  'archive-inline': '5082058362',
  /** `/`: between Featured and Topics. */
  'home-mid': '2867967721',
} as const

export type Placement = keyof typeof AD_SLOTS

/**
 * The size each placement reserves.
 *
 * A fixed unit rather than a responsive one, because the rail is a fixed 300px
 * track and because §8's rule is to reserve the maximum always: a 90px banner
 * landing in a 250px reservation leaves whitespace, and that is the correct
 * trade against any layout shift at all.
 */
export const SLOT_SIZES: Record<Placement, SlotSize> = {
  'rail-1': { kind: 'fixed', width: 300, height: 250 },
  // 280px is §8's figure for this placement as a fixed 336x280, kept as the
  // floor now that the unit is Google's in-article format. Measure the real
  // creatives after launch: if they routinely come back taller, this is the
  // number to raise, and if they routinely come back shorter it is costing
  // whitespace on every article.
  'article-inline-1': { kind: 'fluid', layout: 'in-article', reserve: 280 },
  'article-inline-2': { kind: 'fluid', layout: 'in-article', reserve: 280 },
  'article-inline-3': { kind: 'fluid', layout: 'in-article', reserve: 280 },
  // The three billboards reserve the mobile height this time, because the
  // desktop and the phone heights differ and there is one number to hold. A
  // responsive unit cannot be told which of 970x250 or 300x250 it will serve,
  // so §8's rule becomes a floor again — the same concession the fluid units
  // make, for the same reason.
  'article-end': { kind: 'responsive', reserve: 250 },
  'archive-inline': { kind: 'responsive', reserve: 250 },
  'home-mid': { kind: 'responsive', reserve: 250 },
}

/**
 * The viewport a placement needs before it is on the page at all, in px.
 *
 * `rail-1` lives in `.article__rail`, which `app/globals.css` sets to
 * `display: none` below 80rem — so below 1280px the unit mounts, is invisible,
 * and asks Google to fill a box no one can see. That is most of the traffic on
 * a publication like this one, and it is wrong three times over: the requests
 * are wasted, the fill rate they come back with is a number about nothing, and
 * serving into a hidden container is not something to be doing to an ad
 * network on purpose.
 *
 * CSS cannot prevent it, because the push is JavaScript and `display: none`
 * does not stop an effect running. So the breakpoint has to be a fact the
 * component can read, and it belongs here next to the slot's other properties
 * rather than as a number copied into a component. The design test checks it
 * against the stylesheet that makes it true.
 *
 * A placement with no entry has no requirement and fills everywhere — the
 * in-article units are in the reading column, and the billboards are in the
 * block and listing containers, all of which exist at every width.
 */
export const SLOT_MIN_WIDTH: Partial<Record<Placement, number>> = {
  'rail-1': 1280,
}

/** The viewport a placement needs, or null where it has no requirement. */
export function minViewportWidth(placement: Placement): number | null {
  return SLOT_MIN_WIDTH[placement] ?? null
}

/** Google's slot id shape: digits, and nothing else that reaches an attribute. */
const SLOT_ID = /^[0-9]{10}$/

/** The reserved height a placement holds before anything fills it. */
export function reservedHeight(placement: Placement): number {
  const size = SLOT_SIZES[placement]
  return size.kind === 'fixed' ? size.height : size.reserve
}

/** Whether every configured slot id is one AdSense could actually have issued. */
export function slotIdsAreWellFormed(): boolean {
  return Object.values(AD_SLOTS).every((id) => SLOT_ID.test(id))
}
