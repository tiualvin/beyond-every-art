// Which analytics tag, if any, a deployment should render.
//
//   NEXT_PUBLIC_GTM_ID=GTM-XXXXXXX  -> Google Tag Manager container
//   NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX  -> GA4 tag, loaded directly
//
// Pure and env-driven, in the same shape as `lib/seo/indexing.ts`, so the
// decision can be unit-tested rather than reasoned about from a rendered page.
//
// See `docs/ANALYTICS.md` for how to choose between the two and what a strict
// CSP costs a Tag Manager container.

// Relative, not `@/`: `lib/security/csp.ts` imports this file and is itself
// reachable from `next.config.ts`, which Next compiles before the path aliases
// exist. See the note there.
import { isNoindex } from '../seo/indexing'

type Env = Record<string, string | undefined>

/**
 * The tag to render, discriminated by which product loads it.
 *
 * `gtm` and `ga4` are alternatives rather than a pair. A container almost
 * always fires GA4 itself, so rendering both would send every page_view to the
 * same property twice — and GA4 offers no way to separate doubled hits after
 * the fact.
 */
export type AnalyticsTag =
  { kind: 'gtm'; id: string } | { kind: 'ga4'; id: string }

/**
 * Google's published id shapes.
 *
 * Validated rather than trusted, for two reasons. The id is interpolated into
 * a script URL and into an inline script body, so a value containing a quote
 * would break out of the string it sits in — operator-supplied today, but a
 * shape check costs nothing and removes the question. And a typo that silently
 * produced a tag pointing at nothing is exactly the failure this whole area is
 * prone to: better to render no tag than a broken one, because a missing tag is
 * at least visible in Realtime.
 */
const GTM_ID = /^GTM-[A-Z0-9]+$/
const GA4_ID = /^G-[A-Z0-9]+$/

/**
 * Decide which tag a deployment renders, or `null` for none.
 *
 * Three rules, in order:
 *
 * 1. **A non-indexable deployment renders nothing.** `NEXT_PUBLIC_NOINDEX` is
 *    the marker for "this is not the real site", and search engines and
 *    analytics obey it together. One switch means they cannot drift apart, so
 *    staging can never quietly pollute the production property — which is the
 *    failure with no undo, since GA4 cannot separate test traffic from real
 *    traffic once both are in the same property.
 * 2. **Tag Manager wins when both are set.** If a container is configured, the
 *    GA4 tag is almost certainly inside it, and loading the direct tag as well
 *    double-counts. Preferring the container is the reading that cannot
 *    double-count: at worst it loads a container that fires nothing.
 * 3. **A malformed id renders nothing**, per the note on the patterns above.
 */
export function resolveAnalyticsTag(
  env: Env = process.env,
): AnalyticsTag | null {
  if (isNoindex(env)) return null

  const gtmId = (env.NEXT_PUBLIC_GTM_ID ?? '').trim()
  if (gtmId) return GTM_ID.test(gtmId) ? { kind: 'gtm', id: gtmId } : null

  const gaId = (env.NEXT_PUBLIC_GA_ID ?? '').trim()
  if (gaId) return GA4_ID.test(gaId) ? { kind: 'ga4', id: gaId } : null

  return null
}

/**
 * True when a tag *could* render, ignoring the noindex gate.
 *
 * The CSP is built in middleware and must permit whatever the page may load,
 * so it keys on configuration rather than on the gate: permitting an origin a
 * page then does not use costs nothing, while withholding one it does use
 * breaks the tag under enforcement.
 */
export function analyticsConfigured(env: Env = process.env): boolean {
  return Boolean(
    (env.NEXT_PUBLIC_GTM_ID ?? '').trim() ||
    (env.NEXT_PUBLIC_GA_ID ?? '').trim(),
  )
}
