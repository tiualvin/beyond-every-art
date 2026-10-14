// The cache's lifetime, on its own, so that knowing it costs no framework.
//
// `content.ts` is the module that wraps reads in Next's cache and so imports
// `next/cache`; that is fine inside the app and fatal anywhere else that loads
// TypeScript directly. Playwright's loader is one: on 14 Oct 2026 the whole e2e
// suite failed to start because `lib/content/schedule.ts` re-exported this
// number from `content.ts`, and the MCP tools, which the OAuth spec imports,
// had started reading `schedule.ts`. A number with no dependencies cannot do
// that.

/**
 * How long a cached read survives without being purged.
 *
 * On-demand purging is what keeps the site current; this is the backstop for
 * the case where it does not run — a document written straight to the database,
 * a hook that threw, a deploy mid-write. Ten minutes is short enough that
 * nobody is left looking at yesterday's archive and long enough that a crawler
 * working through 117 URLs does not re-query for each one.
 */
export const CONTENT_TTL_SECONDS = 600
