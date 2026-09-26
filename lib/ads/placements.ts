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
 * Two shapes, because the two live placements are genuinely different units.
 * A `fixed` slot is a display unit of a known size and reserves exactly that.
 * A `fluid` slot is one of Google's in-article units, whose height depends on
 * the creative — so there is nothing exact to reserve, and `reserve` is a
 * floor chosen to cover the common case rather than a promise. §8's "reserve
 * the maximum, always" cannot be honoured by a format that has no maximum;
 * the honest version is to say so here rather than to pretend.
 */
export type SlotSize =
  | { kind: 'fixed'; width: number; height: number }
  | { kind: 'fluid'; layout: 'in-article'; reserve: number }

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
  /** Text, `/[slug]`: repeated down the body — see `lib/ads/inline.ts`. */
  'article-inline': '5370387884',
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
  'article-inline': { kind: 'fluid', layout: 'in-article', reserve: 280 },
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
 * A placement with no entry has no requirement and fills everywhere —
 * `article-inline` is in the reading column, which exists at every width.
 */
export const SLOT_MIN_WIDTH: Partial<Record<Placement, number>> = {
  'rail-1': 1280,
}

/** The viewport a placement needs, or null where it has no requirement. */
export function minViewportWidth(placement: Placement): number | null {
  return SLOT_MIN_WIDTH[placement] ?? null
}

/**
 * The widest viewport that still counts as a phone, in px, for the phone-only
 * in-article tier (`planInlineSlots` in `lib/ads/inline.ts`).
 *
 * 30rem, the width `app/globals.css` hides `.ad-slot[data-tier='mobile']`
 * above. Every phone in portrait is narrower — the widest is 440px. It is this
 * narrow because the column widens with the viewport while the phone tier's
 * spacing is fixed in words, so a wider limit is a denser page: at 35rem the
 * widest column could fit two units in one tall phone screen, and at 48rem a
 * small tablet in portrait (744 × 1133) would. The design test checks the
 * number against the stylesheet, and the spacing at the widest column it
 * allows.
 */
export const MOBILE_MAX_WIDTH = 480

/**
 * The media query a slot must match before it asks for an ad, or null for none.
 *
 * Two independent limits, because they come from two different things. The
 * minimum is the placement's — the track it lives in (`rail-1`). The maximum is
 * the tier's — a phone-only in-article unit is hidden above `MOBILE_MAX_WIDTH`,
 * and hiding a box stops nothing in JavaScript.
 */
export function slotMediaQuery(
  placement: Placement,
  tier: 'all' | 'mobile' = 'all',
): string | null {
  const min = minViewportWidth(placement)
  const parts = [
    min === null ? null : `(min-width: ${min}px)`,
    tier === 'mobile' ? `(max-width: ${MOBILE_MAX_WIDTH}px)` : null,
  ].filter((part): part is string => part !== null)

  return parts.length === 0 ? null : parts.join(' and ')
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
