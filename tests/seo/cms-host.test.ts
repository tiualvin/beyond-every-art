// The CMS hostname, and why it says noindex.
//
// `cms.beyondeveryart.com` serves the same application as `www`, and its
// Caddy block ends in a catch-all that proxies every frontend route. Search
// Console for 21 Jul – 22 Oct 2026 showed 35 article URLs with impressions on
// the CMS host, and 8 that had impressions there and nowhere else — each with
// a canonical tag pointing at `www`, which Google overrode. Nothing that host
// serves is meant for a search engine, so every response from it says so.
//
// Checked against a real Caddy 2.10.2 binary with a stub upstream on 24 Oct
// 2026: the deferred header replaces the application's own `X-Robots-Tag` on
// `/indexnow.txt` rather than adding a second one, and the public block's
// responses carry no `X-Robots-Tag` at all.

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

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
})
