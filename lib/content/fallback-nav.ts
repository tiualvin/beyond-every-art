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

import { dictionaryFor } from '../i18n/dictionaries'
import { DEFAULT_LOCALE, type Locale } from '../i18n/locales'
import {
  APPS_PATH,
  FEED_PATH,
  HOME_TOPICS_ID,
  JOURNAL_PATH,
  localeFeedPath,
  localeHomePath,
  localeSearchPath,
  NEWSLETTER_PATH,
  SEARCH_PATH,
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

/**
 * What the footer serves while the `footer` global carries no links — which is
 * every page, on staging and in production.
 *
 * The header has had a fallback since 4 Sep and the footer never got one, so
 * every page on the site closes on a wordmark and a copyright line and nothing
 * else. That is not a small omission at the foot of a long article: it is the
 * one place a reader who has finished something looks for what to read next,
 * and the answer has been nothing.
 *
 * Wider than the masthead's four on purpose. A masthead is a choice between a
 * few destinations and a footer is an index, so this adds the two the header
 * deliberately leaves out — search, which lives behind an icon up there, and
 * the feed, which has never been linked from anywhere a reader can see.
 *
 * Same rule as above: every entry names a real destination, and
 * `tests/content/nav-links.test.ts` checks both lists the same way.
 */
export const FALLBACK_FOOTER_NAV: NavLink[] = [
  { label: 'Journal', url: JOURNAL_PATH },
  { label: 'Topics', url: `/#${HOME_TOPICS_ID}` },
  { label: 'Search', url: SEARCH_PATH },
  { label: 'Apps', url: APPS_PATH },
  { label: 'About', url: '/about' },
  { label: 'Newsletter', url: NEWSLETTER_PATH },
  { label: 'RSS feed', url: FEED_PATH },
]

/**
 * The masthead and footer for a translated language whose `header` and
 * `footer` globals have no links of their own in it.
 *
 * Smaller than English's on purpose: every entry has to name a page that
 * exists in that language, and the journal, topics, apps and about pages are
 * English-only. What a translated edition has is its home page, its search and
 * its feed — so that is what it links to, in its own words.
 */
export function fallbackNavFor(locale: Locale): {
  header: NavLink[]
  cta: NavLink
  footer: NavLink[]
} {
  if (locale === DEFAULT_LOCALE) {
    return {
      header: FALLBACK_NAV,
      cta: FALLBACK_CTA,
      footer: FALLBACK_FOOTER_NAV,
    }
  }
  const t = dictionaryFor(locale).nav
  const home = { label: t.home, url: localeHomePath(locale) }
  const search = { label: t.search, url: localeSearchPath(locale) }
  return {
    header: [home, search],
    cta: { label: t.subscribe, url: NEWSLETTER_PATH },
    footer: [home, search, { label: t.feed, url: localeFeedPath(locale) }],
  }
}
