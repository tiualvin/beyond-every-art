// `ads.txt` lives at the repository root, and the application does not serve it.
//
// That is deliberate and it is not the obvious arrangement, so it is worth
// stating plainly: on Ghost a redirect answers `/ads.txt`, and the file here is
// the record of what that redirect points at. Next.js serves static assets from
// `public` and nowhere else, so a file at the root is never a URL — which is
// correct while the redirect is the serving mechanism, and a bug the day it
// stops being.
//
// See `docs/ADVERTISING.md` §1 for the cutover consequence, which is the part
// that fails quietly: the Ghost redirect is importable into the `Redirects`
// collection, but the middleware matcher skips any path containing a dot, so a
// redirect row for `/ads.txt` can look perfectly configured and never run.
//
// What is checked here is the file's contract with ad buyers, which holds
// wherever it is eventually served from: a malformed record is dropped by
// parsers, and a dropped record means unauthorised inventory.

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

  it('is not in public/, where it would silently start being served', () => {
    // Moving it there changes who answers `/ads.txt` — the app rather than the
    // redirect — which is a decision about a third party's records, not a
    // tidy-up. It also needs a `COPY` of `public` added to the Dockerfile in
    // the same change, or the file is served in `next dev` and 404s in
    // production. Make that move deliberately; do not let it happen as a
    // side effect of moving a file somewhere it looks like it belongs.
    expect(existsSync(join(root, 'public', 'ads.txt'))).toBe(false)
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
