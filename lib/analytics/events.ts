// Ad-slot coverage, as an event a GA4 report can split.
//
// The number the ad layer is judged on is coverage: of the slots a page asks
// Google to fill, how many come back with an ad. AdSense reports it per ad
// unit, but not against the reader's country — and the country mix is what
// decides what the inventory is worth. A GA4 event carries the country on the
// hit itself, so one event naming the placement and the outcome is enough to
// read coverage by placement *and* by country, which is the pair of questions
// `docs/ADVERTISING.md` §8 keeps answering by hand.
//
// Pure and separately testable, in the same shape as the rest of `lib/`: the
// payload is a function, and the send is a function over a target object, so
// the two tag modes can be asserted without a browser.
//
// One caveat worth stating here rather than discovering in a report. This is
// not the only coverage number, and it does not replace AdSense's. It counts
// what a browser was allowed to report: a reader with JavaScript off, or a
// blocker that stops GA4 as well as AdSense, is in neither. It is a *relative*
// signal — which placement fills better, and in which country — not an
// absolute fill rate.

/** What a slot turned out to hold, once anything is known about it. */
export type AdSlotFill = 'filled' | 'unfilled'

/** The GA4 event name. One name, two parameters, so no report is a lookup. */
export const AD_SLOT_EVENT = 'ad_slot'

/** The parameters every `ad_slot` event carries. */
export function adSlotParams(
  placement: string,
  fill: AdSlotFill,
): { placement: string; fill: AdSlotFill } {
  return { placement, fill }
}

/** What a custom event needs from wherever the tag happens to live. */
export type TagTarget = {
  gtag?: (...args: unknown[]) => void
  dataLayer?: unknown[]
}

/**
 * Send one `ad_slot` event through whichever tag is loaded.
 *
 * Two modes, because the site loads two kinds of tag and they take an event
 * differently (`docs/ANALYTICS.md`). The GA4 tag, loaded directly, defines
 * `gtag` and queues onto `dataLayer` itself; a Tag Manager container does not
 * define `gtag`, so the event goes on `dataLayer` in the shape a container
 * consumes, and a GA4 event tag in the container maps `ad_slot` to a hit.
 *
 * It is one or the other, never both: in the GA4-direct case `dataLayer` is
 * also an array, so pushing as well would send the event twice.
 *
 * A target with neither is a no-op. That is the ordinary state of a deployment
 * with analytics off — staging, or a local build — and it is not an error.
 */
export function sendAdSlot(
  target: TagTarget,
  placement: string,
  fill: AdSlotFill,
): void {
  const params = adSlotParams(placement, fill)

  if (typeof target.gtag === 'function') {
    target.gtag('event', AD_SLOT_EVENT, params)
    return
  }

  if (Array.isArray(target.dataLayer)) {
    target.dataLayer.push({ event: AD_SLOT_EVENT, ...params })
  }
}

/** `sendAdSlot` against the live window, or a no-op on the server. */
export function reportAdSlot(placement: string, fill: AdSlotFill): void {
  if (typeof window === 'undefined') return
  sendAdSlot(window as TagTarget, placement, fill)
}
