# SEO risk at cutover

What is actually likely to happen to search rankings when Ghost is replaced,
which parts of that are already closed, and the one preparation that becomes
impossible the moment DNS changes.

This is the "will we lose traffic" question. It does not restate the mechanics:
[`SEO_AND_REDIRECTS.md`](SEO_AND_REDIRECTS.md) has the parity layer,
[`MIGRATION_REHEARSAL.md`](MIGRATION_REHEARSAL.md) has the verification, and
[`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md) has the day itself.

## The short answer

A temporary dip is normal and should be expected. A lasting drop is unlikely
**given what is built**, and the residual risk is concentrated in verification
that has not run yet rather than in anything known to be wrong.

The reason the structural risk is low is worth being explicit about, because it
is the single biggest fact about this migration: **the domain and the URLs do
not change.** Most migrations that lose traffic lose it by moving hosts or
restructuring paths. This one does neither. `trailingSlash: true` matches the
Ghost permalinks, so migrated URLs are served directly rather than through a
redirect, and `legacyHTML` preserves the Ghost-rendered markup, so the text a
crawler already indexed is byte-identical.

That reduces this to a platform swap behind unchanged addresses, which is the
mildest kind there is.

## What is already closed

Recorded here so nobody re-opens it out of nervousness on cutover day:

- **The URL shape.** `trailingSlash: true`, decided rather than defaulted.
- **Redirects, audited end to end**, not spot-checked. The audit found that
  Ghost paginates in the path (`/page/2/`, `/tag/x/page/2/`) while this site
  paginates in the query string, and that Ghost's own `redirects.json` says
  nothing about those because Ghost served them itself. With 117 posts that was
  a large set of URLs that would have 404ed on cutover day.
- **`pnpm validate:redirects` has run against a live app and exited zero**,
  including those pagination rules, with `Location` headers resolving to the
  forwarded host.
- **The noindex switch is guarded.** [`../tests/seo/noindex-is-runtime.test.ts`](../tests/seo/noindex-is-runtime.test.ts)
  fails if `lib/seo/indexing.ts` is refactored into the one shape Next.js would
  inline at build time, which would leave the deployment serving `Allow: /` no
  matter what the environment said.
- **Canonical tags, sitemap, feed, and JSON-LD** are built from
  `NEXT_PUBLIC_SITE_URL` and unit tested, with a per-document canonical override
  and per-document noindex available for the cases that need them.
- **Paying subscribers are not a factor.** There are none, so the teaser
  rendering on restricted posts costs no indexed content.

## What is still open, in the order it matters

**1. The crawl comparison has not been run.** §6 of the rehearsal, using the
comparator in [`MIGRATION_WEBSITE_COMPARATOR.md`](MIGRATION_WEBSITE_COMPARATOR.md).
Everything above proves the machinery; only this compares the two sites' actual
output page by page. The pagination finding is the argument for spending the
hour: it was a real, large, silent breakage found by looking rather than by
reasoning.

**2. The content checks in §4 are unticked** — counts against Ghost admin,
media loading from R2 with alt text, embeds and captions inside migrated
bodies, the metadata Ghost carried. These are the ones only real content can
answer.

**3. The noindex switch is now the only thing keeping staging out of the
index.** Basic Auth came off on 28 Aug. It is guarded by a test and it has been
observed working, but the consequence of it failing changed: it is no longer
"staging is visible", it is "a complete duplicate of the site is indexable on a
second hostname". Worth one manual check of `robots.txt` on staging whenever
that deployment changes, and it is why the guard test exists.

**4. Media URLs changed.** Images now come from R2 rather than the Ghost
domain. Any ranking those files held in image search starts again from their new
addresses. Minor for an editorial site, non-zero for one whose subject is
pigment and colour.

## The one systemic difference from Ghost

Every public route is `force-dynamic`, so pages are server-rendered per request.
The database reads behind them are cached and purged on publish
(`lib/cache/content.ts`), which removes the query cost, but React still renders
per request on one small server with **no CDN in front** — Cloudflare is DNS
only until [`EDGE_PROTECTION.md`](EDGE_PROTECTION.md) is worked through.

Ghost was probably faster to first byte. Page experience is a modest ranking
factor on its own; the reason to care is that slower responses also spend crawl
budget, and this is the one respect in which the new site is plausibly worse
than the old one rather than equivalent. Closing edge protection is the fix, and
it is already on the list for its own reasons.

## Capture the baseline before the flip

The runbook's post-launch list says to watch "analytics traffic vs. the
pre-migration baseline". Nothing created that baseline, so it is a checklist
item now in [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md), with the full procedure
in [`SEO_BASELINE_CAPTURE.md`](SEO_BASELINE_CAPTURE.md).

**A correction to an earlier version of this section**, which said the baseline
"cannot be done afterwards" because the data stops being observable once DNS
moves. That was wrong, and wrong in a way worth recording, because it is the
kind of claim that sounds obviously true. Search Console data belongs to the
_property_, which is the domain — and **the domain is not changing**. This is a
platform migration, not a domain migration, so the history stays and stays
readable.

What is actually at risk is narrower and more specific:

- **Verification can lapse.** If the property is verified by an HTML file or a
  `<meta>` tag that Ghost is serving, that proof dies with Ghost and Google
  eventually unverifies the property. The data is not deleted, but it becomes
  unreadable until re-verified. A DNS-record verification survives, because it
  lives in the zone rather than on the origin. **This is the item that can
  genuinely lock you out**, and it is worth fixing before cutover.
- **Retention is about 16 months**, so the pre-migration window ages out on its
  own regardless.
- **Ghost's own built-in analytics** die with the subscription — those are
  unrecoverable.
- **GA4 continuity** holds only if the same measurement ID carries across.

So the baseline is still worth capturing, for durability past the retention
window and for the convenience of frozen numbers to diff against. It is just
not the one-way door it was previously described as. The one-way door is the
verification method.

What to export, in short — the click paths are in
[`SEO_BASELINE_CAPTURE.md`](SEO_BASELINE_CAPTURE.md):

- **Queries** and **Pages** from Search Console, three months, with clicks,
  CTR and average position.
- The current **indexed page count**.
- From GA4: sessions by channel, and organic landing pages, same window.

Three months rather than one so a seasonal comparison is possible, and
impressions rather than clicks as the sort because impressions move first when
something is wrong.

## Reading the aftermath

Expect movement for a few weeks while Google recrawls and re-renders. That is
the normal settling shape for a platform migration with URL parity, and it is
not evidence of damage on its own.

What distinguishes the two is the **shape** of the change, not its size:

| Pattern                                                                                  | Reading                                                                    |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Broad, shallow drift across everything, recovering                                       | Recrawl noise. Wait.                                                       |
| Drop concentrated on one URL pattern — all tag pages, all paginated archives, one author | A redirect or template problem. Diagnose it.                               |
| Impressions steady, clicks down                                                          | Titles or descriptions changed. Compare against the baseline.              |
| Pages leaving the index entirely                                                         | Check `robots.txt` and the `noindex` meta tag first, before anything else. |
| 404s climbing in the `not_found` log lines                                               | A URL shape nothing redirects. Add the rule.                               |

The first check on any alarming signal is the cheapest one: fetch `robots.txt`
and view-source an article for `noindex`. That failure mode looks exactly like
"the site works perfectly" from every other angle, which is what makes it worth
ruling out first rather than last.

Keep Ghost online until this settles. The runbook already says not to cancel it
on cutover day; the reason is here — it is the only rollback that restores the
previous rankings rather than merely restoring a site.
