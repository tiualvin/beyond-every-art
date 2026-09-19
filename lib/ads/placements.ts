// Where an ad unit may go, by name, and what shape it is there.
//
// The names are the public contract and the ids behind them are not, which is
// the whole point of the indirection: `docs/ADVERTISING.md` §5 asks for a name
// for what a slot *is*, never for what fills it, the same way `BLOCK_SLUGS` in
// `blocks/schema.ts` names a block rather than its renderer. A component asks
// for `rail-1`; that it is an AdSense slot today and some managed partner's
// unit at the traffic thresholds in §6 is a fact this file keeps to itself.
//
// The inventory in §8 has five placements and four of them are not built. They
// are deliberately not listed here either — a name with no call site is a name
// nobody has had to make work, and the split rule for the in-body units (§4)
// is a piece of real work rather than a table row.

/** The reserved box, in CSS pixels, that a placement's slot must never shift. */
export type SlotSize = { width: number; height: number }

/**
 * AdSense slot ids, by placement.
 *
 * These are per-unit ids created in the AdSense console against the publisher
 * in `lib/ads/adsense.ts`. A slot id belonging to a different publisher does
 * not error, it simply never fills, so the two travel together and
 * `tests/ads/placements.test.ts` pins their shape.
 */
export const AD_SLOTS = {
  /** Rail, `/[slug]`: above the related pieces, inside the sticky group. */
  'rail-1': '3235264856',
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
  'rail-1': { width: 300, height: 250 },
}

/** Google's slot id shape: digits, and nothing else that reaches an attribute. */
const SLOT_ID = /^[0-9]{10}$/

/** Whether every configured slot id is one AdSense could actually have issued. */
export function slotIdsAreWellFormed(): boolean {
  return Object.values(AD_SLOTS).every((id) => SLOT_ID.test(id))
}
