// The security headers that are not the Content-Security-Policy.
//
// These live apart from `csp.ts` for one reason that matters: `CSP_MODE=off` is
// the documented incident escape hatch for the policy, and it makes
// `buildCspHeaders` return nothing at all. Turning the policy off during an
// incident must not also strip `nosniff` and HSTS — those have no rollout
// phases, no report-only mode, and nothing to tune. They are either sent or
// they are a gap.
//
// Pure and env-driven, in the same shape as `csp.ts` and `lib/seo/indexing.ts`,
// so the headers can be unit-tested rather than inspected by hand in a browser.

import { buildCspHeaders, type CspHeader, type CspOptions } from './csp'

type Env = Record<string, string | undefined>

/** One year, the value HSTS preload lists require and the usual floor. */
export const HSTS_MAX_AGE_SECONDS = 31_536_000

/**
 * Whether to claim HTTPS-only for a year.
 *
 * Only outside development, where the site is served over plain http and a
 * browser would ignore the header anyway — but sending it there would still be
 * a lie, and one that a developer who once visited `localhost` over https would
 * have to clear by hand.
 *
 * `includeSubDomains` is included because both hostnames this project serves
 * (`SITE_ADDRESS` and `CMS_ADDRESS`) hold real certificates. `preload` is
 * deliberately absent: it is a submission to a list baked into browser binaries
 * and is slow and awkward to reverse, which is not a commitment to make from a
 * config file before the domain has even cut over.
 */
export function hstsValue(): string {
  return `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`
}

export interface SecurityHeaderOptions extends CspOptions {
  env?: Env
  isDevelopment?: boolean
}

/**
 * Headers that apply regardless of what the CSP is doing.
 *
 * Deliberately not here: `X-Frame-Options`. Its modern equivalent,
 * `frame-ancestors`, is already in the policy, and the two disagree in a way
 * that matters to this application — Live Preview renders the public site
 * inside an iframe from the admin, so a blanket `DENY` would break it, and
 * `SAMEORIGIN` breaks it too as soon as the admin is served from `CMS_ADDRESS`
 * rather than the site's own hostname. Clickjacking protection here comes from
 * enforcing the CSP with a `frame-ancestors` list that names the admin origin,
 * which is a staged decision that belongs to
 * `docs/CONTENT_SECURITY_POLICY.md`, not a header added blind.
 */
export function buildBaselineSecurityHeaders(
  options: SecurityHeaderOptions = {},
): CspHeader[] {
  const dev = options.isDevelopment ?? false

  const headers: CspHeader[] = [
    // Uploaded files are served from `/api/media/file/<name>` on the site's own
    // origin. Without this a browser is free to disregard the stored content
    // type and sniff a response into something executable, which turns any file
    // that reaches the media collection into a same-origin script question.
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // Full URLs stop at the origin when leaving the site, so a reader following
    // a link out of a search results page does not hand their query to the
    // destination.
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // Nothing here uses any of these, and an injected iframe or embed should
    // not be able to ask for them on the site's behalf.
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=()',
    },
  ]

  if (!dev) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: hstsValue(),
    })
  }

  return headers
}

/**
 * Every security header the application sends, in one list.
 *
 * `next.config.ts` calls this rather than `buildCspHeaders`, so that adding a
 * header is a change in one place and so the baseline above cannot be lost by
 * a change to how the policy is delivered.
 */
export function buildSecurityHeaders(
  options: SecurityHeaderOptions = {},
): CspHeader[] {
  return [...buildBaselineSecurityHeaders(options), ...buildCspHeaders(options)]
}
