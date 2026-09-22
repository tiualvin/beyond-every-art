// One signup per page.
//
// Two identically labelled email inputs on one page is a form nobody can fill
// in confidently, and the site has two signups to keep apart: the shared band
// in the layout, and the page-specific forms on `/` and `/newsletter`. The
// matching is what this pins — trailing slashes included, since the site runs
// under `trailingSlash` and a path arrives either way.

import { describe, expect, it } from 'vitest'

import {
  hasOwnSignup,
  PATHS_WITH_OWN_SIGNUP,
} from '../../lib/content/signup-paths'

describe('hasOwnSignup', () => {
  it('stands the band down on every page that has its own form', () => {
    for (const path of PATHS_WITH_OWN_SIGNUP) {
      expect(hasOwnSignup(path)).toBe(true)
    }
  })

  it('covers the homepage and the newsletter page', () => {
    // Named rather than derived: an entry silently dropping out of the list is
    // the failure this is here to catch.
    expect(hasOwnSignup('/')).toBe(true)
    expect(hasOwnSignup('/newsletter/')).toBe(true)
  })

  it('matches with or without a trailing slash', () => {
    expect(hasOwnSignup('/newsletter')).toBe(true)
    expect(hasOwnSignup('/newsletter/')).toBe(true)
  })

  it('leaves the band on every other page', () => {
    for (const path of [
      '/journal/',
      '/tag/palette/',
      '/ultramarine-science/',
      '/apps/',
      '/search/',
      // Not a prefix match: a post whose slug begins with the word is not the
      // newsletter page.
      '/newsletter-archive/',
    ]) {
      expect(hasOwnSignup(path)).toBe(false)
    }
  })

  it('leaves it on when the path is unknown', () => {
    // `usePathname` can be null before hydration; showing the band is the
    // safe side of that, because the worst case is a signup a reader ignores
    // rather than a page with none.
    expect(hasOwnSignup(null)).toBe(false)
    expect(hasOwnSignup(undefined)).toBe(false)
    expect(hasOwnSignup('')).toBe(false)
  })
})
