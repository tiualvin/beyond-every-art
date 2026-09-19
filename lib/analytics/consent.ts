// What a Google tag is allowed to store before the reader has said anything.
//
// The site runs Google's Privacy & messaging CMP, configured in the AdSense
// console, and the AdSense tag serves the banner itself. That closed the
// requirement in `docs/ADVERTISING.md` §2 for ads. It did not close the other
// half: a Google tag with no declared consent default treats consent as
// *granted*, so GA4 set cookies on every EEA and UK visit from the moment the
// page loaded until the banner's answer arrived — if it arrived at all.
//
// This module declares the default. It is the seam §9 argues for: the
// application depends on Consent Mode signals, which every certified CMP
// emits, rather than on any one CMP's JavaScript API. Swapping CMP — which
// happens by construction the day a managed ad partner arrives, since they
// bring their own — is then a console change rather than a code change.
//
// Pure and env-driven, in the same shape as `tag.ts` and `lib/ads/adsense.ts`,
// so the decision can be unit-tested rather than read off a rendered page.

type Env = Record<string, string | undefined>

/** The four signals Consent Mode v2 requires a publisher to declare. */
export const CONSENT_SIGNALS = [
  'ad_storage',
  'ad_user_data',
  'ad_personalization',
  'analytics_storage',
] as const

export type ConsentSignal = (typeof CONSENT_SIGNALS)[number]
export type ConsentState = 'granted' | 'denied'

export type ConsentDefault = Record<ConsentSignal, ConsentState> & {
  /** ISO 3166 codes this command applies to; absent means everywhere. */
  region?: readonly string[]
  /** Milliseconds a tag holds before firing, so the CMP can answer first. */
  wait_for_update?: number
}

/**
 * Where a banner is required, and therefore where consent starts denied.
 *
 * The EEA (the EU 27 plus Iceland, Liechtenstein and Norway), the United
 * Kingdom, and Switzerland — which is the scope §2 names and the scope
 * Google's "European regulations" message is shown in.
 *
 * This list is the reason the defaults are not simply "denied everywhere".
 * Google's CMP shows nothing outside these countries, so a global denial would
 * never be updated for anybody else: analytics would go cookieless worldwide,
 * permanently, and look like a configuration that was working.
 */
export const RESTRICTED_REGIONS = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  // EEA, not EU.
  'IS',
  'LI',
  'NO',
  // Outside both, and required all the same.
  'GB',
  'CH',
] as const

/**
 * How long a tag waits for the CMP's answer before firing with the default.
 *
 * Google's documented example. It is a real cost on every restricted-region
 * page view and the alternative is worse: without it a tag can fire, and set a
 * cookie, in the gap between the page loading and the banner being answered —
 * which is the exact gap this module exists to close.
 */
export const CONSENT_WAIT_MS = 500

const ALL_DENIED: Record<ConsentSignal, ConsentState> = {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
}

const ALL_GRANTED: Record<ConsentSignal, ConsentState> = {
  ad_storage: 'granted',
  ad_user_data: 'granted',
  ad_personalization: 'granted',
  analytics_storage: 'granted',
}

/**
 * The `consent default` commands to declare, in the order they are emitted.
 *
 * Two of them in the ordinary case, and the pair is the whole design:
 *
 * 1. Granted, with no region — everywhere the banner is not shown, which is
 *    where the site has always set cookies and where nothing is asking it to
 *    stop.
 * 2. Denied, scoped to `RESTRICTED_REGIONS`, carrying `wait_for_update`.
 *
 * Order does not decide which wins; specificity does. Google's rule is that
 * "the one with a more specific region will take effect", so the regional
 * command governs the countries it names and the unscoped one governs the
 * rest, whichever is emitted first. They are emitted broad-then-narrow because
 * that is the order a reader expects, not because it changes the outcome.
 *
 * `NEXT_PUBLIC_CONSENT_SCOPE=all` collapses this to a single denied default
 * with no region — the conservative reading, for the day a banner runs
 * worldwide or a CMP misconfiguration needs covering without a deploy. It is
 * the same kind of switch as `NEXT_PUBLIC_ADSENSE_CLIENT=off`, and it has the
 * same caveat in reverse: with Google's CMP as configured today it denies
 * analytics to readers who will never be shown a way to agree.
 */
export function consentDefaults(env: Env = process.env): ConsentDefault[] {
  const scope = (env.NEXT_PUBLIC_CONSENT_SCOPE ?? '').trim().toLowerCase()

  if (scope === 'all') {
    return [{ ...ALL_DENIED, wait_for_update: CONSENT_WAIT_MS }]
  }

  return [
    { ...ALL_GRANTED },
    {
      ...ALL_DENIED,
      region: RESTRICTED_REGIONS,
      wait_for_update: CONSENT_WAIT_MS,
    },
  ]
}

/**
 * The bootstrap script's body: `dataLayer`, `gtag`, and the defaults.
 *
 * Built here rather than in the component so that the thing that ends up in a
 * `<script>` is a pure function of the environment and can be asserted on in a
 * unit test. Every value interpolated is either a literal from this file or
 * `JSON.stringify` of one — no operator-supplied string reaches the script
 * body, which is why `NEXT_PUBLIC_CONSENT_SCOPE` is a two-value switch rather
 * than a region list somebody could type into.
 *
 * `ads_data_redaction` rides along: with `ad_storage` denied it strips ad click
 * identifiers from the requests Google tags make, which is the companion
 * setting Google documents alongside a denied default and costs nothing where
 * consent is granted.
 */
export function consentBootstrap(env: Env = process.env): string {
  const commands = consentDefaults(env)
    .map((payload) => `gtag('consent','default',${JSON.stringify(payload)});`)
    .join('\n')

  return [
    'window.dataLayer = window.dataLayer || [];',
    'function gtag(){dataLayer.push(arguments);}',
    "gtag('set','ads_data_redaction',true);",
    commands,
  ].join('\n')
}
