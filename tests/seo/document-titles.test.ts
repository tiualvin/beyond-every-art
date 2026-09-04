// Ghost's titling rule, which the migration has to keep.
//
// Measured on 4 Sep by fetching all 113 posts from both the live Ghost site and
// staging and comparing the rendered `<title>`:
//
//   posts and pages   bare, as authored      "Why Titanium White Behaves…"
//   tag and author    " - Beyond Every Art"  "Art - Beyond Every Art"
//   homepage          brand plus a tagline   "Beyond Every Art | Inspiration,…"
//
// The layout applied `%s — <site title>` to everything, so **none of the 113
// titles matched Ghost**: the median grew from 59 to 78 characters, the number
// over Google's ~60-character display limit went from 54 to 109, and the three
// posts whose author had written their own ` | beyondeveryart` suffix got it
// twice. A title is the headline of a search result, so rewriting all 113 on
// cutover day is not a cosmetic change.
//
// Route metadata is `generateMetadata` against a live Payload, which a unit
// test cannot call, so this asserts the mechanism instead: `title.absolute` on
// the two content routes (the only way to opt out of a template in Next), the
// separator on the template itself, and the homepage's default. The same
// approach, and the same reason, as `noindex-is-runtime.test.ts`.

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { DEFAULT_SITE_SETTINGS } from '@/lib/content/queries'

const root = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const layout = read('app/(frontend)/layout.tsx')
const contentRoute = read('app/(frontend)/[slug]/page.tsx')

describe('document titles match what Ghost served', () => {
  it('gives posts and pages a title no template can extend', () => {
    // Both branches of `generateMetadata` — the page one and the post one.
    expect(contentRoute.match(/title:\s*\{\s*absolute:/g)).toHaveLength(2)
    // The shape this replaced. A bare `title:` here is templated, and the
    // Open Graph and Twitter titles below it — which are `title: post.title`
    // and are not page titles — must not be mistaken for it.
    expect(contentRoute).not.toContain('title: post.metaTitle')
    expect(contentRoute).not.toContain('title: page.metaTitle')
  })

  it('suffixes the generated archives with a hyphen, as Ghost did', () => {
    // `Art - Beyond Every Art`, not `Art — Beyond Every Art`. The em dash was
    // this repository's choice; the hyphen is what is indexed.
    expect(layout).toContain('template: `%s - ${settings.title}`')
  })

  it('titles the homepage with the brand and its tagline', () => {
    expect(layout).toContain('default: settings.homeTitle')
    expect(DEFAULT_SITE_SETTINGS.homeTitle).toBe(
      'Beyond Every Art | Inspiration, Creativity & Artistry',
    )
  })

  it('keeps the homepage meta description separate from the standfirst', () => {
    // `description` is rendered as visible copy under the cover, so it cannot
    // double as the search snippet: Ghost's meta description is 197 characters
    // and would break the layout it was pasted into.
    expect(layout).toContain('description: settings.metaDescription')
    expect(DEFAULT_SITE_SETTINGS.metaDescription).toMatch(
      /^Reflect on what lies beyond art\./,
    )
    expect(DEFAULT_SITE_SETTINGS.metaDescription).not.toBe(
      DEFAULT_SITE_SETTINGS.description,
    )
    expect(DEFAULT_SITE_SETTINGS.description.length).toBeLessThan(80)
  })
})
