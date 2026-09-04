// What the site chrome serves while the `header` global carries no links.
//
// Not a theoretical default: the global is empty on staging and in production,
// so this *is* the live navigation. It sat in the component file until 4 Sep,
// where one of its four entries — `/topics`, a path no route claims — had been
// 404ing in the masthead of every page since the redesign. It lives here so
// `tests/content/nav-links.test.ts` can check the destinations without
// rendering React, and so the list reads as the data it is.
//
// Every entry must name a real destination: a route under `app/(frontend)`, a
// published page, or an anchor on a page that renders it.

import {
  APPS_PATH,
  HOME_TOPICS_ID,
  JOURNAL_PATH,
  NEWSLETTER_PATH,
} from '../seo/site'

import type { NavLink } from './queries'

export const FALLBACK_NAV: NavLink[] = [
  { label: 'Journal', url: JOURNAL_PATH },
  // The topics archive is a section of the homepage, not a route of its own.
  { label: 'Topics', url: `/#${HOME_TOPICS_ID}` },
  { label: 'Apps', url: APPS_PATH },
  { label: 'About', url: '/about' },
]

export const FALLBACK_CTA: NavLink = {
  label: 'Subscribe',
  url: NEWSLETTER_PATH,
}
