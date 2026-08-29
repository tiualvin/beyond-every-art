# Capturing the search baseline

How to record what the Ghost site ranked for, and where its traffic came from,
before the cutover. The reasoning for wanting a baseline at all is in
[`SEO_CUTOVER_RISK.md`](SEO_CUTOVER_RISK.md); this file is the procedure.

Google moves its interfaces. The click paths below were accurate in **August
2026** — if a menu has moved, the thing being asked for is still the same.

## First, what actually survives the flip

It is worth being precise about this, because the reason to capture a baseline
is not the one that sounds most urgent.

**Search Console history does not disappear when DNS moves.** The data belongs
to the _property_, which is the domain — and the domain is not changing. Ghost
to self-hosted is a platform migration, not a domain migration, so the history
stays where it is and stays readable.

What can actually cost you the baseline, in order of how likely it is to bite:

1. **Verification can lapse, and that locks you out.** If the property is
   verified by an HTML file or a `<meta>` tag, both of which Ghost is currently
   serving, that proof disappears the moment Ghost stops answering the domain.
   Google re-checks periodically and unverifies properties that stop proving
   ownership. The data is not deleted — but you cannot read it until you
   re-verify, and re-verifying is harder when you are already mid-incident.
   **This is the one to check before cutover.** See below.
2. **Retention is about 16 months.** The pre-migration window ages out on its
   own schedule regardless of what you do. A frozen export outlives it.
3. **Ghost's own built-in analytics die with the subscription.** Anything only
   visible inside Ghost Admin is genuinely unrecoverable once you cancel, and
   nothing here can bring it back.
4. **GA4 continuity depends on carrying the same measurement ID across.** Same
   property, same ID, and the series is continuous through the migration. A new
   property, and the comparison you actually want becomes impossible.

So: capture the baseline for durability and for the convenience of having
frozen numbers to diff against, and fix the verification method because that
one can genuinely lock you out. Not because the history evaporates on
cutover day.

## Before exporting: two things that must not break

### 1. Check the Search Console verification method

**Settings → Ownership verification.**

If it lists **HTML file** or **HTML tag** as the only verified method, that
method dies with Ghost. Add a **DNS record** verification now, while both
systems are up — it lives in the Cloudflare zone rather than on the origin, so
it survives cutover, a server rebuild, and any future move.

A **Domain property** (`sc-domain:beyondeveryart.com`) is verified by DNS by
definition and covers every subdomain, which is the more robust arrangement if
you are setting one up anyway. It also means `staging.` traffic would appear in
the same property — harmless, since staging is `noindex`.

### 2. Carry the GA4 measurement ID across

The tag on the Ghost site is injected through Ghost's code injection settings,
so it stops firing when Ghost does. Find the measurement ID (`G-XXXXXXXXXX`) in
**GA4 → Admin → Data Streams → the web stream**, and set it on the new site:

```
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

Two things worth knowing about how this one behaves here:

- It is read at **runtime**, not baked into the build, so setting it in `.env`
  and restarting is enough — no rebuild, and unlike
  `NEXT_PUBLIC_CHECKOUT_URL_MONTHLY` it is not a Docker build argument. The
  difference is which bundle the read lands in, and it is worth knowing because
  it decides this every time: `app/(frontend)/layout.tsx` is a server component,
  so its `process.env.NEXT_PUBLIC_GA_ID` survives into the server build and the
  value reaches the browser as a prop on `Analytics`. The checkout URL is read
  in `lib/membership.ts`, which `app/(frontend)/components/site-chrome.tsx`
  imports — a client component — so Next replaces that read at build time and a
  value supplied at container start would arrive too late. A `NEXT_PUBLIC_*`
  read needs a build argument when it can reach the client bundle, not merely
  because of its name.
- The tag is gated on `!isNoindex()`, so it stays off on staging automatically
  and starts firing when `NEXT_PUBLIC_NOINDEX` comes off at the flip. Staging
  traffic never reaches the property.

Same ID as Ghost used means one continuous series across the migration, which
is exactly what makes the after comparable to the before.

## Search Console export

**Performance → Search results.**

1. Set the date filter to **Last 3 months**. Three rather than one so a
   seasonal comparison is possible later.
2. Turn on all four metric toggles above the chart: **Total clicks**, **Total
   impressions**, **Average CTR**, **Average position**. They are off by
   default for CTR and position, and a baseline missing position is much less
   useful.
3. Click **Export** (top right) → **Download CSV**. You get a zip with one CSV
   per tab — Queries, Pages, Countries, Devices, Dates. Keep all of them.
4. Sort by **impressions**, not clicks. Impressions move first when something
   is wrong; clicks lag behind them.

The export contains up to 1,000 rows per tab rather than the top 100 the
runbook asks for. Keep the larger file — the extra rows cost nothing and the
long tail is where a broken URL pattern shows up first.

Then **Indexing → Pages** and write down the **Indexed** count. That single
number is the fastest post-cutover check there is: if it falls off a cliff,
the cause is almost always `robots.txt` or a `noindex` tag rather than
anything subtle.

### The data lags

Search Console is two to three days behind, so "last 3 months" ends a couple of
days before today. That is normal and not worth waiting out. If the flip slips
by more than a week or two after you export, take a fresh export on the day —
the point is a window ending as close to the cutover as possible.

## GA4 export

Same three-month window as Search Console, so the two are comparable.

**Organic landing pages** — the important one, because it is the per-URL view
that tells you _which_ pages moved:

1. **Reports → Engagement → Landing page**
2. Set the date range to match.
3. Add a filter: **Session default channel group** exactly matches **Organic
   Search**.
4. **Share this report → Download file → Download CSV**.

**Traffic by channel** — the context for reading the above:

1. **Reports → Acquisition → Traffic acquisition**
2. Same date range, same export path.

This gives you total sessions per channel, which is what distinguishes "organic
fell" from "everything fell" — and those have completely different causes.

## Where the files go

Into `seo-baseline/` in this repository, which is **git-ignored** except for its
README. This repository is public, and the convention here is that exported
material is never committed; see the `ghost-export/` block in `.gitignore`.

That makes `seo-baseline/` a local working directory, **not** a backup. Copy it
somewhere durable — the same place the `BACKUP_ENCRYPTION_KEY` passphrase
lives is a sensible choice, because that is already somewhere that is neither
this repository nor the VPS.

Naming, dated by export day:

```
seo-baseline/search-console-queries-20260901.csv
seo-baseline/search-console-pages-20260901.csv
seo-baseline/ga4-landing-pages-20260901.csv
seo-baseline/ga4-traffic-acquisition-20260901.csv
seo-baseline/SUMMARY.md
```

## The summary

The CSVs are the detail. `SUMMARY.md` is what anyone actually reads three weeks
later while trying to work out whether traffic really moved, so it is worth the
five minutes. Copy this and fill it in:

```markdown
# Search baseline — captured YYYY-MM-DD

Window: YYYY-MM-DD to YYYY-MM-DD (Search Console lags ~3 days)
Search Console property: <URL-prefix or sc-domain:...>
Verification method: <DNS record / HTML tag / HTML file>
GA4 property + measurement ID: <name> / G-XXXXXXXXXX

## Search Console, three months

- Total clicks:
- Total impressions:
- Average CTR:
- Average position:
- Indexed pages (Indexing → Pages):

## Top 10 queries by impressions

| Query | Impressions | Clicks | Position |
| ----- | ----------- | ------ | -------- |

## Top 10 pages by impressions

| Page | Impressions | Clicks | Position |
| ---- | ----------- | ------ | -------- |

## GA4, same window

- Sessions, all channels:
- Sessions, Organic Search:
- Top 5 organic landing pages:

## Notes

Anything unusual in the window — a post that went unusually well, an outage,
a seasonal spike — that would otherwise look like a migration effect later.
```

That last section earns its place. A traffic shape nobody can explain three
weeks after a migration gets blamed on the migration, and the explanation is
sometimes just that one post did well in July.

## Reading it afterwards

[`SEO_CUTOVER_RISK.md`](SEO_CUTOVER_RISK.md#reading-the-aftermath) covers which
shapes of change are recrawl noise and which are a real problem. The short
version: a broad shallow dip across everything is normal settling, and a drop
concentrated on one URL pattern is a template or redirect bug. The distinction
is the pattern, not the size.
