// Ghost paginates in the path, this site paginates in the query string, and
// nothing in Ghost's redirects export covers the difference — Ghost never
// needed a redirect for a URL it served itself. Every `/page/N/` URL on the
// live site today therefore becomes a 404 on cutover day unless something
// answers it.
//
// These pin what answers it, including the two cases that look like pagination
// and are not.

import { describe, expect, it } from 'vitest'

import { legacyGhostRedirect, legacyProbePaths } from '@/lib/seo/ghost-urls'
import { middlewareServes } from '@/lib/seo/middleware-coverage'

describe('legacyGhostRedirect', () => {
  it('sends the home collection pagination to the journal archive', () => {
    // Not to `/`, which shows a fixed handful of recent pieces. The archive
    // that lists everything is the journal.
    for (const path of ['/page/2/', '/page/2', '/page/17/']) {
      expect(legacyGhostRedirect(path), path).toEqual({
        destination: '/journal/',
        statusCode: 301,
      })
    }
  })

  it('sends tag and author pagination to the archive itself', () => {
    // Both list the whole set on one page here, so the base path is the
    // complete answer rather than an approximation of it.
    expect(legacyGhostRedirect('/tag/painting/page/2/')).toEqual({
      destination: '/tag/painting/',
      statusCode: 301,
    })
    expect(legacyGhostRedirect('/author/alvin/page/4/')).toEqual({
      destination: '/author/alvin/',
      statusCode: 301,
    })
  })

  it('does not map a paginated URL onto another 404', () => {
    // The reason pagination collapses to the bare archive instead of to
    // `?page=N`: `/journal/` calls `notFound()` past the end of the archive, so
    // `/page/40/` -> `/journal/?page=40` would be a permanent redirect to a
    // dead URL, which is worse than the 404 it replaced.
    expect(legacyGhostRedirect('/page/400/')?.destination).toBe('/journal/')
  })

  it('is permanent, because these URLs are not coming back', () => {
    expect(legacyGhostRedirect('/page/2/')?.statusCode).toBe(301)
  })

  it('leaves the URLs this site serves alone', () => {
    for (const path of [
      '/',
      '/journal/',
      '/some-post/',
      '/tag/painting/',
      '/author/alvin/',
      '/apps/some-app/',
      '/search/',
    ]) {
      expect(legacyGhostRedirect(path), path).toBeNull()
    }
  })

  it('does not treat a post whose slug is a number as pagination', () => {
    // `/page/2/` is pagination; `/notes/2/` is a two-segment path that this
    // site does not serve and that no built-in rule should guess at.
    expect(legacyGhostRedirect('/notes/2/')).toBeNull()
  })

  it('does not mistake a reserved prefix for an archive slug', () => {
    // `/tag/page/2/` reads as the tag archive's second page, not as a tag
    // called `page` — and a tag named after a route prefix must not redirect
    // away from itself.
    expect(legacyGhostRedirect('/tag/tag/page/2/')).toBeNull()
    expect(legacyGhostRedirect('/author/journal/page/2/')).toBeNull()
  })

  it('ignores a page number that is not one', () => {
    for (const path of [
      '/page/0/',
      '/page/01/',
      '/page/-1/',
      '/page/two/',
      '/page/1.5/',
      '/page/',
    ]) {
      expect(legacyGhostRedirect(path), path).toBeNull()
    }
  })

  it('answers the same whichever slash shape the URL arrives in', () => {
    // Inbound links are inconsistent about the trailing slash and Ghost served
    // both; the rule must not depend on which one a crawler kept.
    const expected = { destination: '/tag/painting/', statusCode: 301 }
    for (const path of [
      '/tag/painting/page/2/',
      '/tag/painting/page/2',
      '//tag//painting//page//2//',
    ]) {
      expect(legacyGhostRedirect(path), path).toEqual(expected)
    }
  })
})

describe('the built-in rules are reachable', () => {
  it('runs the middleware for every path these rules answer', () => {
    // A built-in rule sits behind the same matcher as a table row, so it can be
    // dead in exactly the same way. These paths carry no dot, but that is a
    // property worth asserting rather than assuming.
    for (const path of legacyProbePaths({
      tagSlugs: ['painting'],
      authorSlugs: ['alvin'],
    })) {
      expect(middlewareServes(path), path).toBe(true)
      expect(legacyGhostRedirect(path), path).not.toBeNull()
    }
  })
})

describe('legacyProbePaths', () => {
  it('probes the home pagination even with no slugs to expand', () => {
    expect(legacyProbePaths()).toEqual(['/page/2/', '/page/3/'])
  })

  it('expands one probe per tag and author', () => {
    expect(
      legacyProbePaths({ tagSlugs: ['a', 'b'], authorSlugs: ['c'] }),
    ).toEqual([
      '/page/2/',
      '/page/3/',
      '/tag/a/page/2/',
      '/tag/b/page/2/',
      '/author/c/page/2/',
    ])
  })
})
