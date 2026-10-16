// Whether the content API exists on this deployment, and what it answers when
// it does not.
//
// On its own, with no dependencies, because two runtimes read it: the route
// handlers, and `middleware.ts`, which closes every method on every path under
// the prefix — a route that exports only GET still has OPTIONS and a 405 for
// everything else implemented for it by Next, and neither passes through the
// handler's own check.

/** The prefix every content API path shares. */
export const APP_API_ROOT = '/app-api/'

/**
 * Off unless exactly `1`. Set for the Playwright server and nowhere else;
 * turning it on in production is the owner's decision (docs/COMPANION_APP.md).
 */
export const appApiEnabled = (
  env: Record<string, string | undefined> = process.env,
): boolean => env.APP_API_ENABLED === '1'

/** Whether a request path is the API's, slashed or not. */
export const isAppApiPath = (pathname: string): boolean =>
  pathname === APP_API_ROOT.slice(0, -1) || pathname.startsWith(APP_API_ROOT)

export const NOT_FOUND_BODY = { error: 'Not found' } as const

/** What every answer that is not a 200 carries: never cached, never indexed. */
export const UNCACHED_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
} as const
