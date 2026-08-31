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
// This test guards the pairing rather than the redirect itself — the Caddyfile
// and this reasoning live in different files and would otherwise be free to
// drift apart. See `docs/SEO_AND_REDIRECTS.md`.

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

describe("Ghost's child sitemaps", () => {
  it('are all named in the Caddyfile matcher', () => {
    const matcher = caddyfile.match(/@ghostSitemaps\s+path\s+(.+)/)
    expect(matcher).not.toBeNull()
    for (const path of GHOST_SITEMAPS) {
      expect(matcher![1]).toContain(path)
    }
  })

  it('redirect permanently to the sitemap this site actually publishes', () => {
    expect(caddyfile).toMatch(
      /handle\s+@ghostSitemaps\s*\{[^}]*redir\s+\/sitemap\.xml\s+301/,
    )
  })

  it('are matched exactly, not by prefix', () => {
    // A `*` here would also capture paths this must not answer for.
    const matcher = caddyfile.match(/@ghostSitemaps\s+path\s+(.+)/)![1]
    expect(matcher).not.toContain('*')
  })

  it('are answered before the reverse proxy, not after it', () => {
    // Caddy evaluates `handle` blocks in file order, so the catch-all proxy to
    // the app must come last or it swallows these first.
    const matcherAt = caddyfile.indexOf('@ghostSitemaps')
    const proxyAt = caddyfile.indexOf('reverse_proxy app:3000')
    expect(matcherAt).toBeGreaterThan(-1)
    expect(proxyAt).toBeGreaterThan(matcherAt)
  })

  it('would be unservable as redirect rows, which is why Caddy has them', () => {
    // The premise of this whole arrangement. If the matcher ever stopped
    // skipping dotted paths, a redirect row would become the simpler home for
    // these and this Caddy block could go.
    expect(unservableRedirectSources(GHOST_SITEMAPS).sort()).toEqual(
      [...GHOST_SITEMAPS].sort(),
    )
  })

  it("leaves the site's own sitemap to the application", () => {
    // `/sitemap.xml` is served by Next and is the redirect target here, so
    // matching it at the edge would be a loop.
    const matcher = caddyfile.match(/@ghostSitemaps\s+path\s+(.+)/)![1]
    expect(matcher).not.toMatch(/(^|\s)\/sitemap\.xml(\s|$)/)
  })
})
