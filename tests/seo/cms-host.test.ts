// The CMS hostname, and why it stopped being a second copy of the site.
//
// `cms.beyondeveryart.com` serves the same application as `www`, and its
// Caddy block used to end in a catch-all that proxied every frontend route.
// Search Console for 21 Jul – 22 Oct 2026 showed 35 article URLs with
// impressions on the CMS host, and 8 that had impressions there and nowhere
// else. Every one carried a canonical tag pointing at `www`; Google overrode
// it. So that block now sends `noindex` on everything, and sends any page
// request without a Payload session to the same path on the public address.
//
// What this checks is the matcher evaluated against the paths the code itself
// uses — the preview entry point, the preview targets, the CSP report sink —
// rather than the matcher's text, because the ways this goes wrong are paths
// added or moved somewhere else: a preview that lands outside the exemption,
// a report endpoint that starts being redirected, a cookie renamed out from
// under the matcher. `ghost-sitemaps.test.ts` records why a string check is
// not enough on its own.
//
// Checked against a real Caddy 2.10.2 binary with a stub upstream on 24 Oct
// 2026, which is what settles Caddy's semantics: the exemptions match by
// prefix, case-insensitively; `not` clauses in one matcher are ANDed; the
// deferred header replaces the application's own `X-Robots-Tag` on
// `/indexnow.txt` rather than adding a second one; and the public block's
// responses carry no `X-Robots-Tag` at all. See `docs/SEO_AND_REDIRECTS.md`,
// "The CMS host".

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  LIVE_PREVIEW_COOKIE,
  PREVIEW_COLLECTIONS,
  PREVIEW_PATH,
  previewTargetPath,
} from '@/lib/preview/live-preview'
import { CSP_REPORT_PATH } from '@/lib/security/csp'
import { MEDIA_FILE_PATH, postPath } from '@/lib/seo/site'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const caddyfile = readFileSync(join(root, 'Caddyfile'), 'utf8')

/** The Caddyfile with comment lines removed, so `#` prose cannot satisfy a match. */
const directives = caddyfile
  .split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .join('\n')

/** The body of the site block whose address line starts with `address`. */
function siteBlock(address: string): string {
  const start = directives.indexOf(`${address} {`)
  expect(start, `no site block for ${address}`).toBeGreaterThanOrEqual(0)
  const open = directives.indexOf('{', start + address.length)
  let depth = 0
  for (let i = open; i < directives.length; i++) {
    if (directives[i] === '{') depth++
    if (directives[i] === '}' && --depth === 0) {
      return directives.slice(open + 1, i)
    }
  }
  throw new Error(`unterminated site block for ${address}`)
}

const SITE_ADDRESS = '{$SITE_ADDRESS:localhost}'
const cms = siteBlock('{$CMS_ADDRESS:cms.localhost}')
const site = siteBlock(SITE_ADDRESS)

/** A named matcher's block, as the lines inside its braces. */
function matcherLines(block: string, name: string): string[] {
  const body = block.match(new RegExp(`@${name}\\s*\\{([^}]*)\\}`))
  expect(body, `no @${name} matcher`).not.toBeNull()
  return body![1]!
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

const anonymous = matcherLines(cms, 'anonymousPage')

/** The paths `@anonymousPage` exempts, from its `not path` line. */
const exemptPaths = anonymous
  .find((line) => line.startsWith('not path '))!
  .slice('not path '.length)
  .split(/\s+/)

/** The Cookie pattern it requires to be absent, from its `not header` line. */
const sessionPattern = anonymous
  .find((line) => line.startsWith('not header Cookie '))!
  .slice('not header Cookie '.length)

/** Caddy's path matcher: a trailing `*` is a prefix, and case is ignored. */
function pathMatches(pattern: string, path: string): boolean {
  const p = pattern.toLowerCase()
  const value = path.toLowerCase()
  return p.endsWith('*') ? value.startsWith(p.slice(0, -1)) : value === p
}

/** Caddy's header matcher for a `*value*` pattern: a substring test. */
function headerMatches(pattern: string, value: string | undefined): boolean {
  if (value === undefined) return false
  expect(pattern, 'only *contains* patterns are modelled').toMatch(/^\*.+\*$/)
  return value.includes(pattern.slice(1, -1))
}

/** Whether a request to the CMS host is sent to the public address. */
function redirected(path: string, cookie?: string): boolean {
  return (
    !exemptPaths.some((pattern) => pathMatches(pattern, path)) &&
    !headerMatches(sessionPattern, cookie)
  )
}

/** Payload's session cookie; `payload.config.ts` keeps the default prefix. */
const SESSION = 'payload-token=eyJhbGciOiJIUzI1NiJ9.signed-in'

/** Next's draft-mode cookie, which `/api/preview` sets. */
const DRAFT = '__prerender_bypass=0123456789abcdef'

/** The 8 articles Search Console showed impressions for only on the CMS host. */
const CMS_ONLY_ARTICLES = [
  'red-color-meaning-western-chinese-painting',
  'how-light-creates-form-space-and-meaning',
  'egg-tempera-the-medium-oil-replaced',
  'ice-wax-melting-materials-sculpture',
  'street-arts-awkward-journey-from-illegal-walls-to-white-cube-galleries',
  'small-artist-run-galleries-in-torontos-junction-triangle-actually-showing-experimental-work',
  'clay-body-composition-warping-large-ceramic-sculpture',
  'artist-skill-development',
]

describe('the CMS host', () => {
  it('sends noindex on every response, as the response is written', () => {
    // Site level, outside `route`, so no handler below can skip it. `defer`
    // so it replaces a value the application sets rather than sitting
    // alongside it.
    const header = cms.slice(0, cms.indexOf('route {'))
    expect(header).toMatch(
      /header\s*\{\s*X-Robots-Tag\s+"noindex, nofollow"\s+defer\s*\}/,
    )
  })

  it('never puts that header on the public site', () => {
    // The failure that would cost the most: one line pasted into the wrong
    // block takes every page of the real site out of the index.
    expect(site).not.toMatch(/X-Robots-Tag/i)
    expect(site).not.toMatch(/noindex/i)
  })

  it.each(CMS_ONLY_ARTICLES)(
    'sends an anonymous request for %s to the public address',
    (slug) => {
      expect(redirected(postPath(slug))).toBe(true)
    },
  )

  it('redirects permanently, to the same path and query on the public host', () => {
    expect(cms).toContain(
      `redir @anonymousPage https://${SITE_ADDRESS}{uri} permanent`,
    )
  })

  it('tells browsers not to keep the redirect', () => {
    // A 301 with no caching headers is cached indefinitely by URL alone, so
    // one anonymous visit would send that page's Live Preview to `www` for
    // good, even after the editor signs in.
    expect(cms).toMatch(/header\s+@anonymousPage\s+Cache-Control\s+no-store\b/)
  })

  it('redirects before the catch-all proxy, not after it', () => {
    // Inside `route`, so this order is the evaluation order.
    const redirect = cms.indexOf('redir @anonymousPage')
    const catchAll = cms.lastIndexOf('handle {')
    expect(redirect).toBeGreaterThan(cms.indexOf('route {'))
    expect(redirect).toBeLessThan(catchAll)
  })

  it('keeps the root redirected too, so the homepage is not duplicated', () => {
    expect(redirected('/')).toBe(true)
    expect(redirected('/journal/')).toBe(true)
    expect(redirected('/tag/materials/')).toBe(true)
  })
})

describe('what the CMS host still serves without a session', () => {
  it.each([
    ['the admin panel', '/admin/'],
    ['the admin login', '/admin/login/'],
    ['the MCP endpoint', '/api/mcp'],
    ['the preview entry point', PREVIEW_PATH],
    ['uploaded files', `${MEDIA_FILE_PATH}photo.jpeg`],
    ['Next assets', '/_next/static/chunks/main.js'],
    ['the image optimizer', '/_next/image/'],
    ['the OAuth consent screen', '/oauth/authorize/'],
    ['OAuth discovery', '/.well-known/oauth-authorization-server'],
    ['the redirect table', '/redirects-map/'],
    // Browsers post reports without cookies and do not follow a redirect to
    // deliver one, so redirecting this would drop the admin's reports.
    ['CSP violation reports', CSP_REPORT_PATH],
  ])('%s', (_, path) => {
    expect(redirected(path)).toBe(false)
  })
})

describe('preview on the CMS host', () => {
  it('uses the same session test as the admin API', () => {
    // Two matchers deciding "is this an editor" must not disagree.
    const sessionApi = matcherLines(cms, 'sessionApi')
    expect(sessionApi).toContain(`header Cookie ${sessionPattern}`)
    expect(sessionPattern).toBe('*payload-token=*')
  })

  it('keeps the cookie the matchers look for', () => {
    // Payload names its session cookie `${cookiePrefix}-token`. A prefix set
    // here would rename it, and both matchers would stop seeing editors.
    const config = readFileSync(join(root, 'payload.config.ts'), 'utf8')
    expect(config).not.toMatch(/cookiePrefix/)
  })

  it.each(PREVIEW_COLLECTIONS)(
    "renders a %s preview's target for a signed-in editor",
    (collection) => {
      const path = previewTargetPath(collection, 'a-draft')
      expect(redirected(path, `${DRAFT}; ${SESSION}`)).toBe(false)
      expect(redirected(path, `${SESSION}; ${LIVE_PREVIEW_COOKIE}=1`)).toBe(
        false,
      )
    },
  )

  it("renders the globals' preview at the root for a signed-in editor", () => {
    expect(redirected('/', SESSION)).toBe(false)
  })

  it('does not let the draft-mode cookie through on its own', () => {
    // `getPreviewMode` ignores draft mode without an editorial session, so
    // this request would render the public page — the duplicate again.
    const path = previewTargetPath('posts', 'a-draft')
    expect(redirected(path, `${DRAFT}; ${LIVE_PREVIEW_COOKIE}=1`)).toBe(true)
  })
})
