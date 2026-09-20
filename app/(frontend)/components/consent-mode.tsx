/**
 * Consent Mode defaults, declared before any Google tag acts on them.
 *
 * A consent default is only a default if it is on `dataLayer` before a tag
 * decides what it may store. Declare it late and the tag has already decided,
 * which is a cookie set on an EEA visit before the banner was answered — the
 * exact gap `docs/ADVERTISING.md` §2 describes.
 *
 * **Where this ends up, measured rather than assumed.** Two plausible
 * placements do not do what their names suggest, and both were tried against a
 * built server before this one was kept:
 *
 * - `next/script` with `strategy="beforeInteractive"` does not hoist from
 *   here. Next reserves that for the literal `app/layout.tsx`, and this is
 *   `app/(frontend)/layout.tsx` — a root layout for its route group, which is
 *   not the same thing. The script rendered into `<body>`, after both loaders.
 * - An explicit `<head>` in the layout does work: the script lands inside it.
 *
 * So this is a plain inline `<script>` and the layout renders it in `<head>`.
 * React 19 still hoists the AdSense loader and the analytics loader above it —
 * both are `<script async src>`, which it lifts to the top of the head — so
 * this is third in the document, not first. That is in time for two
 * independent reasons:
 *
 * 1. Both loaders are `async`, so neither executes during parsing. This one
 *    does, ~900 bytes later in the same parse, and an async script cannot
 *    execute before it has been fetched.
 * 2. More importantly, neither loader reads consent when it loads. GA4 acts on
 *    `gtag('config', …)` and AdSense on `adsbygoogle.push({})`, and both of
 *    those are strictly later than this script — the first after hydration,
 *    the second on an idle callback after that.
 *
 * Verified in Chromium against a production build: `dataLayer` comes out as
 * `set ads_data_redaction`, `consent default`, `consent default`, `js`,
 * `config` — the defaults ahead of the command that sends the first hit.
 * `e2e/analytics-consent.spec.ts` pins that order, because reason 2 is a fact
 * about today's tags rather than a guarantee: a Tag Manager container fires on
 * load, and adding one would make the ordering matter for real.
 *
 * It is inline, so `'unsafe-inline'` in `script-src` is what currently lets it
 * run. `docs/CONTENT_SECURITY_POLICY.md` phase 3 replaces that with nonces,
 * and this is one of the scripts to check when it happens: a consent default
 * that silently fails to run is indistinguishable from never having had one.
 *
 * What this does not do is read consent back. The signals are declared and both
 * Google tags honour them; nothing else on the page sets a non-essential
 * cookie, so there is nothing yet to gate. A reader belongs here when something
 * non-Google needs one, and not before — §9's seam is the signal on
 * `dataLayer`, not an API this file would have to invent a consumer for.
 */
export function ConsentMode({ bootstrap }: { bootstrap: string }) {
  return (
    <script id="consent-mode" dangerouslySetInnerHTML={{ __html: bootstrap }} />
  )
}
