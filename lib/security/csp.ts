// Content-Security-Policy construction.
//
// The policy exists because migrated Ghost bodies are rendered with
// `dangerouslySetInnerHTML` (see `toBodyHtml` and `app/(frontend)/components/
// article.tsx`). React's escaping is deliberately off on that path, so whatever
// `legacyHTML` holds is handed to the browser as live markup. A CSP does not
// stop bad markup reaching the page; it decides what the browser is willing to
// act on once it arrives.
//
// Pure and env-driven, in the same shape as `lib/seo/indexing.ts`, so the
// header can be unit-tested rather than inspected by hand in a browser.
//
// See `docs/CONTENT_SECURITY_POLICY.md` for the rollout, what each phase is
// worth, and the known limits of the current phase.

// Relative, not `@/`. This module is reachable from `next.config.ts` (via
// `headers.ts`), which Next compiles on its own before the path aliases exist —
// an aliased import here fails the build with a bare MODULE_NOT_FOUND. Anything
// this file pulls in inherits the same constraint.
import { analyticsConfigured } from '../analytics/tag'

type Env = Record<string, string | undefined>

/**
 * How the policy is delivered.
 *
 * `report-only` sends `Content-Security-Policy-Report-Only`: the browser
 * reports what it *would* have blocked and blocks nothing. `enforce` sends the
 * real header. `off` sends neither, as an escape hatch for an incident — it
 * should never be the steady state.
 */
export type CspMode = 'report-only' | 'enforce' | 'off'

/**
 * Where violation reports are sent. Matches the route in `app/csp-report`.
 *
 * Slashed because `trailingSlash: true` makes that the address Next.js serves,
 * and a browser posting a violation report does not follow a redirect to go
 * looking for one.
 */
export const CSP_REPORT_PATH = '/csp-report/'

/** The `report-to` / `Reporting-Endpoints` group name. */
export const CSP_REPORT_GROUP = 'csp-endpoint'

/**
 * Google Tag Manager and GA4 origins.
 *
 * Added when either `NEXT_PUBLIC_GTM_ID` or `NEXT_PUBLIC_GA_ID` is set, since
 * both tags load from `googletagmanager.com` and both report to the GA4
 * collectors. Keyed on configuration rather than on the noindex gate that
 * decides whether a tag actually renders: permitting an origin the page then
 * does not use costs nothing, while withholding one it does use breaks the tag.
 * `region1` is the regional collector GA4 falls back to.
 *
 * These cover Google's own requests only. Anything a Tag Manager container
 * fires beyond them needs `CSP_SCRIPT_SRC` and friends below.
 */
const ANALYTICS_SCRIPT_ORIGINS = ['https://www.googletagmanager.com']
const ANALYTICS_CONNECT_ORIGINS = [
  'https://www.google-analytics.com',
  'https://region1.google-analytics.com',
  'https://www.googletagmanager.com',
]
const ANALYTICS_IMG_ORIGINS = [
  'https://www.google-analytics.com',
  'https://www.googletagmanager.com',
]

export function cspMode(env: Env = process.env): CspMode {
  const value = (env.CSP_MODE ?? '').trim().toLowerCase()
  if (value === 'enforce') return 'enforce'
  if (value === 'off') return 'off'
  // Report-only is the default: an unset variable must not silently ship an
  // enforcing policy, and must not silently ship nothing either.
  return 'report-only'
}

/** The header name for a mode, or null when the policy is disabled. */
export function cspHeaderName(mode: CspMode): string | null {
  if (mode === 'off') return null
  return mode === 'enforce'
    ? 'Content-Security-Policy'
    : 'Content-Security-Policy-Report-Only'
}

/**
 * The origin serving uploaded media, derived from `S3_PUBLIC_URL` the same way
 * `next.config.ts` derives `images.remotePatterns`. Without it every R2 image
 * is a violation — and, under enforcement, a broken image.
 */
export function mediaOrigin(env: Env = process.env): string | null {
  const raw = env.S3_PUBLIC_URL
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

/**
 * Third-party origins allowed to be framed.
 *
 * Migrated Ghost bodies contain provider embeds — YouTube and Vimeo players,
 * social cards — as raw iframes inside `legacyHTML`. Enforcing a policy without
 * them silently blanks embeds inside published articles, so the report-only
 * phase exists partly to inventory which providers are actually present. Extend
 * this list from the reports, not from guesswork.
 */
export function frameOrigins(env: Env = process.env): string[] {
  return originList(env.CSP_FRAME_SRC)
}

/**
 * Parse a whitespace- or comma-separated origin list from one variable.
 *
 * Shared by the four extension points below so they behave identically; an
 * operator should not have to remember which separator a given variable takes.
 */
function originList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

/**
 * Operator-supplied additions to `script-src`, `connect-src` and `img-src`.
 *
 * These exist for Google Tag Manager. A container's whole purpose is firing
 * third-party tags chosen in a web interface, long after this policy was
 * written — an ad pixel, a heatmap recorder, a consent platform — and each
 * loads from an origin no list here could have predicted. Without a way to
 * extend the policy, adopting a container means either a policy that blocks
 * half of it or no policy at all.
 *
 * Fill these from the violation reports rather than from guesswork, the same
 * way `CSP_FRAME_SRC` is filled: report-only mode names the exact origin each
 * blocked request wanted. See `docs/ANALYTICS.md`.
 */
export function extraScriptOrigins(env: Env = process.env): string[] {
  return originList(env.CSP_SCRIPT_SRC)
}

export function extraConnectOrigins(env: Env = process.env): string[] {
  return originList(env.CSP_CONNECT_SRC)
}

export function extraImgOrigins(env: Env = process.env): string[] {
  return originList(env.CSP_IMG_SRC)
}

export interface CspOptions {
  env?: Env
  /** Development adds the eval React Refresh and the dev overlay depend on. */
  isDevelopment?: boolean
}

/**
 * Build the policy string.
 *
 * Directive-by-directive reasoning lives in
 * `docs/CONTENT_SECURITY_POLICY.md`; the short version is that everything
 * defaults to same-origin, the destructive legacy vectors (`object-src`,
 * `base-uri`, `form-action`) are closed outright, and the remaining allowances
 * are the ones this application actually uses.
 */
export function buildCspPolicy(options: CspOptions = {}): string {
  const env = options.env ?? process.env
  const dev = options.isDevelopment ?? false
  const media = mediaOrigin(env)
  const analytics = analyticsConfigured(env)
  const frames = frameOrigins(env)

  const scriptSrc = [
    "'self'",
    // Next.js App Router streams the RSC payload through inline <script> tags,
    // and `Analytics` renders an inline GA4 init block. Neither carries a
    // nonce today, so removing this would break every page. It is also the
    // reason this phase does not yet stop injected inline script: closing that
    // gap is phase 3 in the rollout doc, and it needs nonces.
    "'unsafe-inline'",
    ...(dev ? ["'unsafe-eval'"] : []),
    ...(analytics ? ANALYTICS_SCRIPT_ORIGINS : []),
    ...extraScriptOrigins(env),
  ]

  const styleSrc = [
    "'self'",
    // Payload's admin bundle and Next's injected critical CSS both emit inline
    // style. Nonces would cover the app's own output but not Payload's.
    "'unsafe-inline'",
  ]

  const imgSrc = [
    "'self'",
    // `data:` for inlined icons; `blob:` for admin upload previews, which
    // render a locally created object URL before the file reaches R2.
    'data:',
    'blob:',
    ...(media ? [media] : []),
    ...(analytics ? ANALYTICS_IMG_ORIGINS : []),
    ...extraImgOrigins(env),
  ]

  const connectSrc = [
    "'self'",
    ...(media ? [media] : []),
    ...(analytics ? ANALYTICS_CONNECT_ORIGINS : []),
    ...extraConnectOrigins(env),
    // The dev server's HMR socket.
    ...(dev ? ['ws:'] : []),
  ]

  const directives: Array<[string, string[] | null]> = [
    ['default-src', ["'self'"]],
    ['script-src', scriptSrc],
    ['style-src', styleSrc],
    ['img-src', imgSrc],
    ['font-src', ["'self'", 'data:']],
    ['connect-src', connectSrc],
    ['media-src', ["'self'", ...(media ? [media] : [])]],
    // No Flash, no Java, no <object> data. Nothing here uses them, and they are
    // a classic way to execute script past a script-src.
    ['object-src', ["'none'"]],
    // Stops injected markup from rewriting the base URL and re-pointing every
    // relative script and link on the page.
    ['base-uri', ["'self'"]],
    // Stops injected markup from posting the newsletter form — or a fake login
    // — to somebody else's server.
    ['form-action', ["'self'"]],
    // Live Preview renders the public site inside an admin iframe on the same
    // origin, so this must be 'self' rather than 'none'.
    ['frame-ancestors', ["'self'"]],
    ['frame-src', ["'self'", ...frames]],
    ['worker-src', ["'self'", 'blob:']],
    ['manifest-src', ["'self'"]],
    // Only outside development, where the site is served over plain http.
    ['upgrade-insecure-requests', dev ? null : []],
  ]

  const reportUri = (env.CSP_REPORT_URI ?? CSP_REPORT_PATH).trim()
  if (reportUri) {
    // `report-uri` is deprecated but still the only reporting channel some
    // browsers implement; `report-to` is the replacement. Sending both is the
    // standard belt-and-braces during a rollout.
    directives.push(['report-uri', [reportUri]])
    directives.push(['report-to', [CSP_REPORT_GROUP]])
  }

  return directives
    .filter(([, values]) => values !== null)
    .map(([name, values]) =>
      values && values.length > 0 ? `${name} ${values.join(' ')}` : name,
    )
    .join('; ')
}

/**
 * The `Reporting-Endpoints` header value that `report-to` refers to.
 *
 * Without this header the `report-to` directive names a group the browser has
 * never heard of and reports go nowhere.
 */
export function buildReportingEndpoints(env: Env = process.env): string {
  const target = (env.CSP_REPORT_URI ?? CSP_REPORT_PATH).trim()
  return `${CSP_REPORT_GROUP}="${target}"`
}

export interface CspHeader {
  key: string
  value: string
}

/**
 * Every security header to attach, or an empty list when the policy is off.
 *
 * Consumed by `next.config.ts`. Returning a list keeps the wiring there
 * declarative and this file the single place the policy is decided.
 */
export function buildCspHeaders(options: CspOptions = {}): CspHeader[] {
  const env = options.env ?? process.env
  const name = cspHeaderName(cspMode(env))
  if (!name) return []

  return [
    { key: name, value: buildCspPolicy(options) },
    { key: 'Reporting-Endpoints', value: buildReportingEndpoints(env) },
  ]
}
