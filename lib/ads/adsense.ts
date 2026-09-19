// Whether a deployment loads the Google AdSense tag, and for which publisher.
//
//   (unset)                        -> the publisher in `ads.txt`, below
//   NEXT_PUBLIC_ADSENSE_CLIENT=... -> that publisher instead
//   NEXT_PUBLIC_ADSENSE_CLIENT=off -> no tag at all
//
// Pure and env-driven, in the same shape as `lib/analytics/tag.ts`, so the
// decision can be unit-tested rather than read off a rendered page.
//
// See `docs/ADVERTISING.md` for the wider plan this is the first piece of —
// in particular §2, which is the reason the tag alone does not finish the job
// for EEA/UK traffic.

// Relative, not `@/`: `lib/security/csp.ts` imports this file and is itself
// reachable from `next.config.ts`, which Next compiles before the path aliases
// exist. See the note there.
import { isNoindex } from '../seo/indexing'

type Env = Record<string, string | undefined>

/**
 * The publisher whose tag this site loads.
 *
 * Hardcoded rather than required from the environment because the same
 * identifier is already committed, publicly, in `/ads.txt` — that file is the
 * declaration that this publisher may sell this inventory, and a tag naming a
 * different one would be unauthorised by our own record. Keeping the default
 * here means the two cannot be deployed out of step, and
 * `tests/ads/adsense.test.ts` pins them together so a change to one fails
 * until the other follows.
 *
 * `NEXT_PUBLIC_ADSENSE_CLIENT` still overrides it, which is what makes a
 * second property or a quick `off` possible without a code change.
 */
export const ADSENSE_CLIENT = 'ca-pub-3878635086147352'

/**
 * Google's publisher id shape: `ca-pub-` followed by sixteen digits.
 *
 * Validated rather than trusted for the same reason `lib/analytics/tag.ts`
 * validates its ids: the value is interpolated into a script URL, and a typo
 * that produced a tag pointing at nothing is exactly the failure this area is
 * prone to. Better no tag than a broken one — a missing tag is at least
 * visible in the AdSense console.
 */
const CLIENT_ID = /^ca-pub-[0-9]{16}$/

/**
 * The publisher id to load the tag for, or `null` to load nothing.
 *
 * Three rules, in order:
 *
 * 1. **A non-indexable deployment loads nothing.** `NEXT_PUBLIC_NOINDEX` is
 *    the marker for "this is not the real site", and the same switch already
 *    governs analytics. Ad code on a staging or Basic Auth'd deployment is
 *    not merely untidy: AdSense policy is about what is served to real
 *    visitors, and a crawler that cannot reach the page it is asked to
 *    monetise is how an application gets declined.
 * 2. **`off` disables the tag** without a code change, for the day a policy
 *    complaint needs ads gone in the time it takes to restart the container.
 * 3. **A malformed id loads nothing**, per the note on the pattern above.
 */
export function resolveAdsenseClient(env: Env = process.env): string | null {
  if (isNoindex(env)) return null

  const configured = (env.NEXT_PUBLIC_ADSENSE_CLIENT ?? '').trim()
  if (configured.toLowerCase() === 'off') return null

  const client = configured || ADSENSE_CLIENT
  return CLIENT_ID.test(client) ? client : null
}

/** The loader URL for a publisher id. */
export function adsenseScriptUrl(client: string): string {
  return `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`
}
