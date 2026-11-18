// Which visitors get a page's metadata in `<head>`, rather than streamed into
// the body after it.
//
// Next.js 15.5 streams metadata. When `generateMetadata` resolves after the
// page shell — on a warm server that is most requests, measured on 17 Nov 2026
// for every page tested — the title, description, canonical, hreflang and Open
// Graph tags are sent at the end of the body and React moves them into
// `<head>` once the page's JavaScript runs. A browser never notices. Anything
// that reads the HTML as it arrives does: it finds no title and no canonical
// in the head, and a `rel="canonical"` outside `<head>` is one Google says it
// ignores.
//
// Next serves metadata blocking — in the head, before the body — only to user
// agents matching `htmlLimitedBots`. Its default list covers link previews,
// Bingbot and Google's hyphenated crawlers, but deliberately leaves out
// Googlebot itself (it renders JavaScript), every AI assistant's crawler, and
// the SEO crawlers the migration's crawl comparison is run with. This adds
// them, keeps Next's own list underneath so an upgrade that extends it is
// picked up, and leaves browsers streaming exactly as before.
//
// Costs nothing a crawler would notice: the metadata is built from the same
// cached reads the page body waits for anyway.

import { HTML_LIMITED_BOT_UA_RE_STRING } from 'next/dist/shared/lib/router/utils/is-bot'

/**
 * Self-identified automated clients: anything calling itself a bot, crawler or
 * spider, and the `…-User` fetchers AI assistants send on a person's behalf
 * (`ChatGPT-User`, `Claude-User`, `Perplexity-User`). None of these can be
 * assumed to run JavaScript, so none of them should have to.
 */
const GENERIC = ['bot\\b', 'crawl', 'spider', '-User\\b']

/** Named clients the generic patterns miss. Each has a user agent in `tests/seo/metadata-bots.test.ts`. */
const NAMED = [
  // Google's crawler for its other products; no "bot" in its name.
  'GoogleOther',
  // AI crawlers without "bot" in their names.
  'anthropic-ai',
  'cohere-ai',
  'meta-externalagent',
  'meta-externalfetcher',
  // SEO auditing.
  'Sitebulb',
  // Link previews Next's list misses.
  'Mastodon',
  'Iframely',
  'Embedly',
  'URL Preview',
]

/** The pattern for `htmlLimitedBots`, as a string so `next.config.ts` can build the RegExp. */
export const BLOCKING_METADATA_USER_AGENTS = [
  HTML_LIMITED_BOT_UA_RE_STRING,
  ...GENERIC,
  ...NAMED,
].join('|')

/** True when Next serves this user agent its metadata in `<head>`. */
export function getsMetadataInHead(userAgent: string): boolean {
  return new RegExp(BLOCKING_METADATA_USER_AGENTS, 'i').test(userAgent)
}
