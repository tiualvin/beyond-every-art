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
