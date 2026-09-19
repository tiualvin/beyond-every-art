// Whether a given page may carry an ad unit, and for which publisher.
//
// One predicate, in its own module, because `docs/ADVERTISING.md` §5 is right
// about why: the conditions are unrelated to each other, and each of them is a
// bug if it is checked in only some of the places a unit appears. Today there
// are two — the deployment must be one that serves ad code at all, and the
// post must not be a restricted teaser — and the third and fourth (consent,
// and a paying member) land here rather than at a call site when they exist.
//
// Every call site takes its answer from this function from the first commit,
// so that opening ad-free membership is a change in one function rather than a
// hunt through every template.

import { resolveAdsenseClient } from './adsense'

type Env = Record<string, string | undefined>

export type AdContext = {
  /**
   * A post rendering as a teaser behind `MembershipGate`.
   *
   * §4: a truncated article with ads on it is thin content in the sense
   * AdSense's policies care about, and it is also the worst possible reader
   * experience at the exact moment the page is asking someone to subscribe.
   */
  restricted?: boolean
}

/**
 * The publisher to render a unit for on this page, or `null` for no unit.
 *
 * Returning the client rather than a boolean keeps the two answers that a
 * call site needs — may I, and for whom — in one call, so there is no way to
 * render a unit having checked only one of them.
 */
export function adClientFor(
  context: AdContext = {},
  env: Env = process.env,
): string | null {
  if (context.restricted) return null
  return resolveAdsenseClient(env)
}
