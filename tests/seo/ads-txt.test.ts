// `ads.txt` lives at the repository root, and Caddy serves it from there.
//
// The arrangement changed on 29 Aug and the reason is worth keeping: on Ghost a
// redirect answered `/ads.txt`, and this file was only the record of what that
// redirect pointed at. Neither half survives the cutover. Next serves static
// assets from `public` and nowhere else — and `output: 'standalone'` skips even
// that — so a file at the root was never a URL. And the redirect cannot be
// migrated: `middleware.ts` excludes any path containing a dot, so a row for
// `/ads.txt` sits in the `Redirects` collection looking perfectly configured
// and never runs.
//
// So the Caddyfile answers it before the proxy, from this file bind-mounted at
// /srv/ads.txt. That keeps one copy rather than two, and keeps the path clear
// of `trailingSlash: true`, which would otherwise decide whether a crawler
// asking for `/ads.txt` gets the file or a redirect to `/ads.txt/`.
//
// What is checked here is the file's contract with ad buyers — a malformed
// record is dropped by parsers, and a dropped record means unauthorised
// inventory — plus the two halves of the serving path, which are in different
// files and would otherwise be free to drift apart. See `docs/ADVERTISING.md`
// §1.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const adsTxt = readFileSync(join(root, 'ads.txt'), 'utf8')

describe('ads.txt', () => {
  // `readFileSync` above already fails the suite if the file moves, but it
  // fails as an unreadable-file error rather than as the reason, so this names
  // what is expected to be where.
  it('lives at the repository root', () => {
    expect(adsTxt).not.toBe('')
  })

  it('is not in public/, where a second copy could answer instead', () => {
    // Caddy serves the root file. A copy in `public/` would be a second source
    // of truth for a third party's records, and `output: 'standalone'` means it
    // would be served in `next dev` and absent in production — the worst
    // combination, since it looks correct exactly where nobody is checking.
    expect(existsSync(join(root, 'public', 'ads.txt'))).toBe(false)
  })

  // The serving path is two edits in two files, and either alone is a 404: a
  // handle block that reads a file nothing mounts, or a mount nothing reads.
  // Neither failure shows up in a build or a unit test of the app.
  it('is served by the Caddyfile at exactly /ads.txt', () => {
    const caddyfile = readFileSync(join(root, 'Caddyfile'), 'utf8')

    // `handle /ads.txt` and not `/ads.txt*`: the exact path is what crawlers
    // request, and a prefix match would also capture paths this must not serve.
    expect(caddyfile).toMatch(/handle\s+\/ads\.txt\s*\{/)
    // Verified against a real Caddy binary: the request returns 200 with
    // `text/plain; charset=utf-8` and no redirect to the slashed form.
    expect(caddyfile).toMatch(
      /handle\s+\/ads\.txt\s*\{[^}]*root\s+\*\s+\/srv[^}]*file_server/,
    )
  })

  it('is mounted into the Caddy container read-only', () => {
    const compose = readFileSync(join(root, 'docker-compose.yml'), 'utf8')

    // Read-only because nothing should ever write back to a file whose contents
    // are a statement to ad buyers about who may sell this inventory.
    expect(compose).toContain('./ads.txt:/srv/ads.txt:ro')
  })

  it('declares each selling relationship on its own line', () => {
    // The IAB format is one record per line: `domain, publisher ID,
    // relationship, certification authority ID`. A managed programmatic
    // partner adds its own records here, so the file is expected to grow —
    // what must not happen is records folded onto one line, which parsers
    // read as a single malformed record and drop.
    const records = adsTxt
      .split('\n')
      .map((line) => line.split('#')[0]!.trim())
      .filter(Boolean)

    expect(records.length).toBeGreaterThan(0)

    for (const record of records) {
      const fields = record.split(',').map((field) => field.trim())
      expect(fields.length).toBeGreaterThanOrEqual(3)
      expect(fields.length).toBeLessThanOrEqual(4)
      expect(fields[2]!.toUpperCase()).toMatch(/^(DIRECT|RESELLER)$/)
    }
  })

  it('ends with a newline', () => {
    // Originally committed without one. Some parsers drop a final record that
    // is not newline-terminated, which with a single-record file means
    // dropping the only one.
    expect(adsTxt.endsWith('\n')).toBe(true)
  })
})
