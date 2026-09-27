// Which pages carry a signup of their own, and so keep the shared band off.
//
// Two identically labelled email inputs on one page is a form nobody can fill
// in confidently: a reader cannot tell whether they are the same list, and a
// password manager cannot either. The newsletter page has always had its own
// form; the homepage has one now that it closes with `HomepageNewsletter`.
//
// A module rather than a constant inside the band, because the band is a
// client component that reads `usePathname`, and the rule worth pinning is the
// matching — not React. `/`, `/newsletter` and `/newsletter/` all have to mean
// what they say under `trailingSlash`.

import { NEWSLETTER_PATH } from '../seo/site'

/** Paths that render their own signup form. */
export const PATHS_WITH_OWN_SIGNUP: readonly string[] = ['/', NEWSLETTER_PATH]

/** `/journal/` and `/journal` are one destination; `/` is only ever itself. */
function normalise(path: string): string {
  return path.replace(/\/+$/, '') || '/'
}

/** Whether this path already shows a signup, so the shared band should not. */
export function hasOwnSignup(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  const target = normalise(pathname)
  return PATHS_WITH_OWN_SIGNUP.some((path) => normalise(path) === target)
}
