// Ghost's four child sitemaps, and why Caddy answers them.
//
// Ghost split its sitemap into `/sitemap-posts.xml`, `-pages`, `-tags` and
// `-authors`, with `/sitemap.xml` as an index over the four. This site
// publishes one flat `/sitemap.xml`, so the children have nothing behind them.
// Measured on staging on 31 Aug: `/sitemap.xml` returned 200 with
// `application/xml` and 129 `<loc>` entries, and all four children returned 404
// with `text/html` and none.
//
// They cannot be answered by the application. `middleware.ts` excludes any path
// containing a dot, so a redirect row for one of these imports cleanly, is
// returned by `/redirects-map`, shows as enabled in the admin panel, and never
// runs — the same trap `/ads.txt` fell into, and the reason
// `lib/seo/middleware-coverage.ts` exists to model the matcher.
//
// The consequence is narrower than a lost page but real: Google holds these
// four URLs independently of the pages they list, from Ghost's sitemap index
// and from Search Console, and goes on requesting them after the content has
// moved. A 404 is a reported sitemap failure. A 301 to the live sitemap answers
// the question that was actually asked.
//
// **On the shape of these assertions.** The first version of this file checked
// that the Caddyfile contained `redir /sitemap.xml 301` inside a `handle`
// block, and that string is wrong: `redir` takes an optional matcher as its
// first argument, so Caddy read `/sitemap.xml` as the matcher and `301` as the
// destination, adapting to `status: 302, Location: "301"` on a route that could
// never match — and the handle block, left with nothing to do, answered 200
// with an empty body. The test passed. It was asserting the author's
// assumption, not the behaviour.
//
// So what is checked here is the shape that cannot be misread — a named matcher
// first — plus an explicit guard against the ambiguous form ever coming back.
// Verified against a real Caddy 2.8.4 binary with `caddy adapt`, which is the
// only thing that can actually settle it. See `docs/SEO_AND_REDIRECTS.md`.

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { unservableRedirectSources } from '../../lib/seo/middleware-coverage'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const caddyfile = readFileSync(join(root, 'Caddyfile'), 'utf8')

const GHOST_SITEMAPS = [
  '/sitemap-posts.xml',
  '/sitemap-pages.xml',
  '/sitemap-tags.xml',
  '/sitemap-authors.xml',
]

/** The Caddyfile with comment lines removed, so `#` prose cannot satisfy a match. */
const directives = caddyfile
  .split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .join('\n')

describe("Ghost's child sitemaps", () => {
  it('are all named in the matcher', () => {
    const matcher = directives.match(/@ghostSitemaps\s+path\s+(.+)/)
    expect(matcher).not.toBeNull()
    for (const path of GHOST_SITEMAPS) {
      expect(matcher![1]).toContain(path)
    }
  })

  it('redirect permanently to the sitemap this site publishes', () => {
    // Named matcher first: `redir @name <to> <code>` cannot be reparsed as
    // `redir <matcher> <to>` the way a leading-slash argument can.
    expect(directives).toMatch(
      /redir\s+@ghostSitemaps\s+\/sitemap\.xml\s+301\b/,
    )
  })

  it('never uses the form where Caddy reads the target as a matcher', () => {
    // `redir [<matcher>] <to> [<code>]`. A first argument beginning with `/` is
    // a path matcher, so `redir /somewhere 301` silently means "redirect
    // requests for /somewhere to the literal URL 301, with a 302". This is the
    // bug that shipped; it is cheap to make it impossible to reintroduce.
    const ambiguous = directives
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^redir\s+\//.test(line))
    expect(ambiguous).toEqual([])
  })

  it('is a site-level directive, not wrapped in a handle block', () => {
    // `redir` sorts ahead of `handle` in Caddy's directive order, so it is
    // reached before the catch-all `handle { reverse_proxy app:3000 }`. Inside
    // a handle block it would depend on Caddy's specificity sorting instead.
    expect(directives).not.toMatch(/handle\s+@ghostSitemaps/)
  })

  it('matches exactly, not by prefix', () => {
    const matcher = directives.match(/@ghostSitemaps\s+path\s+(.+)/)![1]
    expect(matcher).not.toContain('*')
  })

  it("leaves the site's own sitemap to the application", () => {
    // `/sitemap.xml` is served by Next and is the redirect target here, so
    // matching it would be a loop.
    const matcher = directives.match(/@ghostSitemaps\s+path\s+(.+)/)![1]
    expect(matcher).not.toMatch(/(^|\s)\/sitemap\.xml(\s|$)/)
  })

  it('would be unservable as redirect rows, which is why Caddy has them', () => {
    // The premise the whole arrangement rests on. If the middleware matcher
    // ever stopped skipping dotted paths, a redirect row would become the
    // simpler home for these and this Caddy block could go.
    expect(unservableRedirectSources(GHOST_SITEMAPS).sort()).toEqual(
      [...GHOST_SITEMAPS].sort(),
    )
  })
})
