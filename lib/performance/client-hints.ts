// Payload's colour-scheme client hint, kept to the admin.
//
// `withPayload` adds three headers to every route the application serves —
// `source: '/:path*'`, the public site included:
//
//     Accept-CH:   Sec-CH-Prefers-Color-Scheme
//     Vary:        Sec-CH-Prefers-Color-Scheme
//     Critical-CH: Sec-CH-Prefers-Color-Scheme
//
// They exist so the admin can pick its light or dark theme on the server.
// `Critical-CH` is the expensive one. It tells Chrome that the response is
// wrong without the hint, so a browser that did not send it — every first visit
// to the origin, which is what a reader arriving from search is — throws the
// response away and requests the document again with the hint attached. It
// shows up in navigation timing as an internal 307 and costs a full round trip
// to the VPS before the page can start: measured against the live site, 253 to
// 524ms of extra time to first byte on every first visit, and the field data
// Google assesses Core Web Vitals on is Chrome's, and mostly first visits.
//
// On this deployment the hint is not read anywhere. `admin.theme` is pinned to
// `'dark'` in `payload.config.ts`, and Payload's `getRequestTheme` returns the
// pinned theme before it looks at the header. It is kept on the admin anyway,
// so that unpinning the theme goes back to working as Payload intends rather
// than silently losing the server-side guess.
//
// Pure, and split out of `next.config.ts` for the reason `lib/security/images.ts`
// is: a policy that only lives in the config file is one nobody can assert on.
// `tests/performance/client-hints.test.ts` runs it against the real
// `withPayload`, so an upgrade that renames or moves these headers fails there
// instead of quietly bringing the restart back.

import type { NextConfig } from 'next'

type HeaderRule = Awaited<
  ReturnType<NonNullable<NextConfig['headers']>>
>[number]

type Header = HeaderRule['headers'][number]

/**
 * Payload's admin route. The default, and `payload.config.ts` sets no
 * `routes.admin`; the test checks that both stay true together.
 */
export const ADMIN_ROUTE = '/admin'

const HINT = 'sec-ch-prefers-color-scheme'
const HINT_HEADERS = new Set(['accept-ch', 'critical-ch', 'vary'])

/** One of the three headers above, carrying the colour-scheme hint. */
export function isColorSchemeHintHeader(header: Header): boolean {
  if (!HINT_HEADERS.has(header.key.toLowerCase())) return false
  return header.value
    .toLowerCase()
    .split(',')
    .some((token) => token.trim() === HINT)
}

/**
 * Moves the colour-scheme hint headers off every route and onto the admin.
 *
 * A rule is split rather than re-sourced whole, so anything else that ever
 * travels in the same rule — Payload adds `X-Powered-By` to it when
 * `poweredByHeader` is on — keeps the scope it was given.
 */
export function scopeColorSchemeHintsToAdmin(
  rules: HeaderRule[],
): HeaderRule[] {
  return rules.flatMap((rule) => {
    if (rule.source.startsWith(ADMIN_ROUTE)) return [rule]

    const hints = rule.headers.filter(isColorSchemeHintHeader)
    if (hints.length === 0) return [rule]

    const rest = rule.headers.filter(
      (header) => !isColorSchemeHintHeader(header),
    )
    return [
      ...(rest.length > 0 ? [{ ...rule, headers: rest }] : []),
      { ...rule, source: `${ADMIN_ROUTE}/:path*`, headers: hints },
    ]
  })
}

/** Wraps a finished config — after `withPayload` — so its headers are scoped. */
export function withAdminOnlyColorSchemeHint(config: NextConfig): NextConfig {
  const headers = config.headers
  if (!headers) return config
  return {
    ...config,
    headers: async () => scopeColorSchemeHintsToAdmin(await headers()),
  }
}
