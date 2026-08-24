// `/ads.txt` has to be reachable, and reachable is not the same as committed.
//
// The file was committed at the repository root, where Next.js serves nothing:
// static assets come from `public`, and the production image is a standalone
// bundle that copies only what it is told to. So the publisher ID sat in the
// tree for months declaring a selling relationship that no crawler could read,
// and every check anyone would think to run — the file is there, the ID is
// right — passed.
//
// An ads.txt that 404s is not a degraded ads.txt. Buyers treat an unreadable
// file as an absent one, which makes the inventory unauthorised, which is the
// whole thing the file exists to prevent. These tests check the two facts that
// have to hold together for the URL to answer at all.

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const adsTxt = readFileSync(join(root, 'public', 'ads.txt'), 'utf8')
const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8')

describe('ads.txt', () => {
  // The path is the assertion. `readFileSync` above already fails the suite if
  // the file moves back to the root, but it fails as an unreadable-file error
  // rather than as the reason, so this names it.
  it('lives in public/, which is the only directory Next.js serves it from', () => {
    expect(adsTxt).not.toBe('')
  })

  it('is copied into the production image', () => {
    // `output: 'standalone'` does not include `public`, and Caddy has no
    // `file_server` — it reverse proxies every path to the app container. If
    // this COPY goes, the file is a 404 in production and nowhere else, which
    // is the failure mode that is hardest to notice.
    expect(dockerfile).toMatch(/COPY .*\/app\/public \.\/public/)
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
    // Committed without one. Some parsers drop a final record that is not
    // newline-terminated, which with a single-record file means dropping the
    // only one.
    expect(adsTxt.endsWith('\n')).toBe(true)
  })
})
