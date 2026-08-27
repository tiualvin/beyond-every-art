// A redirect row that can never run is the failure this covers.
//
// `middleware.ts` narrows itself with a matcher, and one clause in it — skip
// any path containing a dot — quietly decides that a whole class of redirect
// sources is unservable. `/ads.txt` is the known instance
// (`tests/seo/ads-txt.test.ts`); Ghost's per-type sitemaps and every
// `/content/images/...` URL are the ones a migration walks into. In all of them
// the row is created, enabled, returned by `/redirects-map`, and dead.
//
// Two things are pinned here: that `middlewareServes` still describes the real
// matcher (Next requires `config.matcher` to be a static literal, so the
// constant cannot be shared and has to be compared instead — the same shape of
// guard as `tests/observability/health-probe-exemption.test.ts`), and that it
// answers correctly for the paths a cutover actually meets.

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  MIDDLEWARE_PAGE_MATCHER,
  middlewareServes,
  unservableRedirectSources,
} from '@/lib/seo/middleware-coverage'

const root = resolve(import.meta.dirname, '../..')

/** The first `config.matcher` entry in `middleware.ts`, read from the file. */
function declaredMatcher(): string {
  const source = readFileSync(join(root, 'middleware.ts'), 'utf8')
  const block = /matcher:\s*\[([\s\S]*?)\]/.exec(source)?.[1]
  expect(block, 'no config.matcher array found in middleware.ts').toBeTruthy()

  const literal = /'((?:[^'\\]|\\.)*)'/.exec(block!)?.[1]
  expect(literal, 'no string literal found in the matcher array').toBeTruthy()

  // The literal is captured as it is written in the source, where the regex's
  // one backslash is spelled with two. Decode it to the string the module
  // actually holds at runtime, so the comparison is between two values rather
  // than between a value and its source spelling.
  return JSON.parse(
    `"${literal!.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`,
  ) as string
}

describe('the middleware matcher, as this module models it', () => {
  it('still matches the literal middleware.ts declares', () => {
    // If this fails, the matcher changed and the copy in
    // `lib/seo/middleware-coverage.ts` has to change with it — otherwise the
    // importer and the cutover validator report on a matcher that is no longer
    // the one running.
    //
    // Compared after decoding the source literal, not against its spelling:
    // `'\\.'` in the file is one backslash at runtime, which is what the
    // constant holds and what the matcher is built from.
    expect(MIDDLEWARE_PAGE_MATCHER).toBe(declaredMatcher())
  })
})

describe('middlewareServes', () => {
  it('runs for the page-like paths a reader arrives on', () => {
    for (const path of [
      '/',
      '/some-post/',
      '/some-post',
      '/tag/painting/',
      '/author/alvin/',
      '/journal/',
      '/page/2/',
      '/tag/painting/page/2/',
      '/ghost/',
      '/signin/',
      '/members/',
    ]) {
      expect(middlewareServes(path), path).toBe(true)
    }
  })

  it('does not run for any path containing a dot', () => {
    // The clause that makes a redirect row silently dead. Ghost's sitemap is an
    // index of these four, so each is a URL search engines hold today; the
    // image paths are what every hotlink and every Google Images result uses.
    for (const path of [
      '/ads.txt',
      '/sitemap-posts.xml',
      '/sitemap-pages.xml',
      '/sitemap-tags.xml',
      '/sitemap-authors.xml',
      '/content/images/2024/01/a-painting.jpg',
      '/content/images/size/w2000/2024/01/a-painting.jpg',
      '/favicon.ico',
    ]) {
      expect(middlewareServes(path), path).toBe(false)
    }
  })

  it('does not run for the prefixes the app or Payload owns', () => {
    for (const path of [
      '/admin',
      '/admin/collections/posts',
      '/api/posts',
      '/oauth/token/',
      '/webhooks/stripe/',
      '/csp-report/',
      '/redirects-map/',
      '/rss/',
    ]) {
      expect(middlewareServes(path), path).toBe(false)
    }
  })

  it('ignores a query string, as the matcher only sees the pathname', () => {
    expect(middlewareServes('/journal/?page=2')).toBe(true)
    expect(middlewareServes('/sitemap-posts.xml?x=1')).toBe(false)
  })
})

describe('unservableRedirectSources', () => {
  it('names the rules that would never fire, in order, once each', () => {
    expect(
      unservableRedirectSources([
        '/old-post/',
        '/ads.txt',
        '/tag/old/',
        '/sitemap-posts.xml',
        '/ads.txt',
      ]),
    ).toEqual(['/ads.txt', '/sitemap-posts.xml'])
  })

  it('is empty when every rule is reachable', () => {
    expect(unservableRedirectSources(['/a/', '/b/', '/tag/c/'])).toEqual([])
  })

  it('ignores blank sources rather than reporting them as unservable', () => {
    // A row with no source is dropped by `buildRedirectMap` already; reporting
    // it here would send an operator looking for a matcher problem that is not
    // there.
    expect(unservableRedirectSources(['', '/a/'])).toEqual([])
  })
})
