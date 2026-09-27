// The header's fallback navigation is the live navigation.
//
// `SiteHeader` uses `FALLBACK_NAV` whenever the `header` global carries no
// links, and it carries none — not on staging, not in production. So these four
// links are what every page of the site actually serves, and one of them,
// `/topics`, 404'd on all of them from the redesign until 4 Sep.
//
// Nothing caught it, and the reason is worth keeping: `scripts/seed-dev.ts`
// fills the `header` global, so every e2e run navigates the *seeded* menu and
// the fallback is never rendered. Its own comment — "menus that point at pages
// nobody has written yet ship 404s in the site chrome" — describes the defect
// exactly, in the one place the defect could not occur.
//
// What this can prove statically is that each fallback URL names a route that
// exists on disk, or an anchor on a page that does. What it cannot is whether a
// root-level slug names a published Page, because that lives in Postgres; those
// are listed in `DOCUMENT_SLUGS` below, where adding an entry is a claim that
// the document exists and is a claim a reviewer can check.
//
// The links are read from `lib/content/fallback-nav.ts` rather than scraped out
// of the component, so an entry written as a path constant is checked the same
// as one written as a literal.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  FALLBACK_CTA,
  FALLBACK_FOOTER_NAV,
  FALLBACK_NAV,
} from '@/lib/content/fallback-nav'

const frontend = resolve(import.meta.dirname, '../../app/(frontend)')

/**
 * Root-level slugs the fallback links to, which `app/(frontend)/[slug]` answers
 * from the database rather than from a file.
 *
 * `about` is a migrated Ghost page: it is in Ghost's sitemap, it returned 200
 * in the 29 Aug URL audit, and `scripts/seed-dev.ts` creates it. An addition
 * here asserts the same of another document.
 */
const DOCUMENT_SLUGS = new Set(['about'])

/** Every statically routable path under `app/(frontend)`, trailing-slashed. */
function staticRoutes(dir: string, prefix = '/'): string[] {
  const routes: string[] = []
  if (existsSync(join(dir, 'page.tsx'))) routes.push(prefix)
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    // A dynamic segment answers for slugs from the database, which this test
    // has no view of; a route group does not appear in the URL at all.
    if (entry.name.startsWith('[') || entry.name.startsWith('(')) continue
    routes.push(
      ...staticRoutes(join(dir, entry.name), `${prefix}${entry.name}/`),
    )
  }
  return routes
}

/**
 * Route handlers outside the `(frontend)` group, by URL.
 *
 * `/rss` is a real destination — the layout already declares it as this
 * document's feed — but it is `app/rss/route.ts`, not a page under
 * `app/(frontend)`, so the scan above cannot see it. A footer that indexes the
 * site should link the feed, and without this the check would call it broken.
 */
function handlerRoutes(dir: string, prefix = '/'): string[] {
  const routes: string[] = []
  if (existsSync(join(dir, 'route.ts'))) routes.push(prefix)
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('[') || entry.name.startsWith('(')) continue
    routes.push(
      ...handlerRoutes(join(dir, entry.name), `${prefix}${entry.name}/`),
    )
  }
  return routes
}

const routes = new Set([
  ...staticRoutes(frontend),
  ...handlerRoutes(resolve(import.meta.dirname, '../../app')),
])
const home = readFileSync(join(frontend, 'page.tsx'), 'utf8')
const header = readFileSync(
  join(frontend, 'components/site-header.tsx'),
  'utf8',
)
const footer = readFileSync(
  join(frontend, 'components/site-footer.tsx'),
  'utf8',
)

const fallbackUrls = [
  ...FALLBACK_NAV,
  FALLBACK_CTA,
  ...FALLBACK_FOOTER_NAV,
].map((link) => link.url)

/** `/journal/` and `/journal` are the same destination under `trailingSlash`. */
function slashed(path: string): string {
  return path.endsWith('/') ? path : `${path}/`
}

describe('the header fallback navigation', () => {
  // The positive control. Without it, a mis-rooted scan or a changed literal
  // would make every assertion below vacuously true rather than failing.
  it('finds the routes and the links it compares', () => {
    expect(routes.has('/')).toBe(true)
    expect(routes.has('/journal/')).toBe(true)
    // The handler scan is load-bearing now that the footer links the feed.
    expect(routes.has('/rss/')).toBe(true)
    expect(routes.size).toBeGreaterThan(3)
    expect(fallbackUrls.length).toBeGreaterThan(3)
  })

  it('points every link at a route or document that exists', () => {
    const broken = fallbackUrls.filter((url) => {
      const [path, fragment] = url.split('#')
      const target = path === '' ? '/' : slashed(path)
      if (routes.has(target)) return false
      if (fragment !== undefined) return true
      const segments = target.split('/').filter(Boolean)
      // Anything deeper than one segment is an archive route, and those are all
      // on disk — so failing to match above means it does not exist.
      return segments.length !== 1 || !DOCUMENT_SLUGS.has(segments[0]!)
    })

    expect(broken).toEqual([])
  })

  it('anchors only at a section the target page renders', () => {
    // `/#topics` is a link to the topics archive only while the homepage still
    // has that section. Both sides name `HOME_TOPICS_ID`, so a rename that
    // touches one and not the other fails here.
    const fragments = fallbackUrls
      .map((url) => url.split('#')[1])
      .filter((fragment): fragment is string => Boolean(fragment))

    // Both menus point at it, and both are checked.
    expect(new Set(fragments)).toEqual(new Set(['topics']))
    expect(home).toContain('id={HOME_TOPICS_ID}')
    // Each component takes its list whole rather than keeping a second copy.
    expect(header).toContain('FALLBACK_NAV')
    expect(footer).toContain('FALLBACK_FOOTER_NAV')
  })
})

describe('the footer fallback navigation', () => {
  // The `footer` global is empty in production too, so until this existed every
  // page on the site ended with a wordmark, a copyright line, and no way on.
  it('is what the footer actually renders', () => {
    expect(FALLBACK_FOOTER_NAV.length).toBeGreaterThan(0)
    expect(footer).toContain('links.length > 0 ? links : FALLBACK_FOOTER_NAV')
  })

  it('offers the two destinations the masthead has no room for', () => {
    // Search lives behind an icon up there and the feed is linked from nowhere
    // a reader can see, which is the point of a footer being an index rather
    // than a second menu.
    const urls = FALLBACK_FOOTER_NAV.map((link) => link.url)
    expect(urls).toContain('/search/')
    expect(urls).toContain('/rss/')
  })

  it('names each destination once', () => {
    const urls = FALLBACK_FOOTER_NAV.map((link) => link.url)
    expect(new Set(urls).size).toBe(urls.length)
  })
})
