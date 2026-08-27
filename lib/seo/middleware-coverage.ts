/**
 * Which paths the middleware actually runs on — and therefore which redirect
 * rules can ever fire.
 *
 * `middleware.ts` narrows itself with a matcher that skips Next internals, the
 * Payload admin and API, the generated SEO files, and **any path containing a
 * dot**. That last clause is the one that costs something: a redirect row whose
 * source is `/ads.txt`, `/sitemap-posts.xml`, or `/content/images/2024/01/a.jpg`
 * can be created in the admin panel, appear enabled, be returned by
 * `/redirects-map`, and never run. Nothing about it looks broken from anywhere
 * an editor can see.
 *
 * That is not hypothetical — it is why `ads.txt` is served by a redirect on
 * Ghost and by nothing here yet (`tests/seo/ads-txt.test.ts`,
 * `docs/ADVERTISING.md` §1). This module generalises that one-off note into
 * something the importer and the cutover validator can check every rule
 * against.
 *
 * Next requires `config.matcher` to be a statically analysable literal, so it
 * cannot import the constant below; the copy here is checked against the real
 * one by `tests/seo/middleware-coverage.test.ts`, the same way
 * `tests/observability/health-probe-exemption.test.ts` pins the health probe.
 */

/**
 * The page-like matcher from `middleware.ts`'s `config.matcher`, verbatim.
 *
 * Keep this identical to the first entry there. The other two entries are the
 * `/api` rate-limit exceptions, which return before any redirect lookup, so
 * they cannot serve a redirect and are deliberately not represented here.
 */
export const MIDDLEWARE_PAGE_MATCHER =
  '/((?!_next/static|_next/image|favicon.ico|admin|api|oauth|webhooks|csp-report|redirects-map|sitemap.xml|robots.txt|rss|.*\\..*).*)'

const MATCHER = new RegExp(`^${MIDDLEWARE_PAGE_MATCHER}$`)

/**
 * Whether the middleware — and so the redirect table — runs for a request path.
 *
 * The path is compared as it would arrive over the wire. Query strings and
 * fragments are dropped first, because the matcher is evaluated against
 * `nextUrl.pathname`.
 */
export function middlewareServes(pathname: string): boolean {
  if (!pathname) return false
  const path = pathname.split(/[?#]/)[0]!
  return MATCHER.test(path.startsWith('/') ? path : `/${path}`)
}

/**
 * The redirect sources that cannot ever be served, given the matcher.
 *
 * Returned in input order and de-duplicated, so an importer or a validator can
 * print them as-is. An empty array means every rule is at least reachable —
 * which is not the same as correct, only that the request reaches the code that
 * would answer it.
 */
export function unservableRedirectSources(
  sources: readonly string[],
): string[] {
  const seen = new Set<string>()
  const unservable: string[] = []

  for (const source of sources) {
    if (!source || seen.has(source)) continue
    seen.add(source)
    if (!middlewareServes(source)) unservable.push(source)
  }

  return unservable
}
