# Google Ad Manager

A plan for moving the two built units — `rail-1` in the post rail and
`article-inline` down the reading column — from AdSense's tag to Google Ad
Manager's, and the conventions for everything that gets a name along the way:
ad units, key-values, orders, line items, creatives, and the ids on the page.

**None of it is built.** [`ADVERTISING.md`](ADVERTISING.md) is the evaluation
this extends. Its §5 seam — placement names as the contract, the network behind
them a detail — is why the switch is small, and its §6 is why the switch is not,
on its own, a revenue event. Read that first.

Related: [`CONTENT_SECURITY_POLICY.md`](CONTENT_SECURITY_POLICY.md),
[`ANALYTICS.md`](ANALYTICS.md), [`POST_PAGE_LAYOUT.md`](POST_PAGE_LAYOUT.md).

## Verdict

**The switch changes the ad server, not the demand.** Under Ad Manager, AdSense
stops being "the tag" and becomes one source of demand — _dynamic allocation_,
or AdSense backfill — competing for every impression that no line item of ours
has claimed. On the day of the switch the same advertisers bid on the same
readers, and the RPM should come out about where it was. A switch justified
internally as "better RPM" will disappoint, and the before/after comparison in
§6 should be read expecting parity, not a lift.

What it buys is four things AdSense cannot do at all:

1. **Selling.** A pigment maker sponsoring every Palette article for a month,
   or one essay carrying one brand — Ad Manager delivers it, paces it, caps it
   and counts it. For a specialist publication with a specific audience and not
   much traffic, this is the most valuable of the four, because a direct CPM
   does not depend on scale the way programmatic yield does.
2. **Numbers per slot, per position, per topic.** `ADVERTISING.md` §8 says the
   keep-or-cut decision is per placement. AdSense reports per ad unit; it cannot
   say whether the first of six in-article units earns five times the sixth,
   which is the question the `INLINE_MAX` cap in
   [`../lib/ads/inline.ts`](../lib/ads/inline.ts) is a guess about. §3's `pos`
   key answers it.
3. **Doors.** Ad Exchange through a Multiple Customer Management (MCM) partner,
   Open Bidding, and eventually header bidding are console work or a partner
   onboarding, not a rewrite of the tag.
4. **A documented strict-CSP path.** Google's publisher tag publishes how to run
   under a nonce-based policy, which is the thing `ADVERTISING.md` §3 said ad
   stacks make hard. §2.6.

What it costs: a second console to keep straight, a heavier script, slot
lifecycle code that AdSense never needed, a new set of CSP origins — and the
consent banner, which moves with the tag and is the one step here that can
silently cost European revenue (§2.1).

**The shape recommended:** keep demand identical at the switch, change one
variable at a time, and make the switch an environment variable so rolling back
is a container restart rather than a deploy. The naming in §3 is the part to
get right first, because ad unit codes cannot be renamed.

## 1. The concepts, mapped onto this codebase

| Ad Manager                   | What it is                                                                               | Here                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Network** (network code)   | The account. A number that begins every tag path.                                        | Takes the place of `ADSENSE_CLIENT` in [`../lib/ads/adsense.ts`](../lib/ads/adsense.ts) |
| **Ad unit**                  | A named piece of inventory, addressed by path: `/<network>/bea-web/rail-1`.              | A **placement** in [`../lib/ads/placements.ts`](../lib/ads/placements.ts)               |
| **Slot** (GPT)               | One instance of an ad unit on one page, bound to one `div`.                              | One rendered `AdUnit`. `article-inline` is one ad unit and up to twelve slots.          |
| **Placement** (Ad Manager's) | A _group_ of ad units, for selling or targeting them together.                           | Nothing — and a name clash. See below.                                                  |
| **Key-value**                | Context sent with each request, for targeting and reporting: `topic=palette`.            | Derived from the post: template, position, subject tags, id. §3.                        |
| **Order**                    | One campaign for one advertiser.                                                         | None until something is sold.                                                           |
| **Line item**                | A delivery instruction: which units, which key-values, when, at what priority and price. | None until something is sold, except QA and the in-article native style (§4).           |
| **Creative**                 | The ad itself.                                                                           | The house fallbacks are _not_ creatives. They stay in the application.                  |
| **Dynamic allocation**       | AdSense (and Ad Exchange, if linked) competing for impressions no line item won.         | Today's entire revenue, relocated.                                                      |
| **Native style** / **Fluid** | How Ad Manager renders a native ad that sizes to its column.                             | How `article-inline`'s current look is reproduced. §2.4.                                |
| **Privacy & messaging**      | Google's certified consent platform, configured per product.                             | The banner the AdSense tag currently loads. §2.1.                                       |
| **Protections**              | Blocking by category, advertiser or URL.                                                 | Whatever is set in AdSense's blocking controls, re-checked.                             |
| **Unified pricing rules**    | Price floors for Google demand.                                                          | None at the switch.                                                                     |

**"Placement" means two things, and this repository already owns the word.**
Here a placement is a named position on a page, the public contract of the ad
layer. In Ad Manager it is a bundle of ad units sold together. The codebase's
meaning wins inside the codebase: code and docs say _ad unit_ for Ad Manager's
inventory and never use "placement" for its grouping object, which §3 names with
a `pkg_` prefix precisely so the two cannot be confused in a report.

**One ad unit, many slots.** `ADVERTISING.md` §8 retired `article-inline-2` and
`-3` as names — one placement, rendered as many times as the article is long.
Ad Manager agrees: GPT allows the same ad unit path on several slots on one
page, each with its own `div`. Which instance is which travels as the `pos`
key-value, not as twelve ad units that would each need creating, sizing and
declaring.

**Priority, in one paragraph.** Every line item has a type that sets its
priority: sponsorship (4) and standard (6–10) are the guaranteed tiers; price
priority, network and bulk share 12; house is 16. Google's own demand competes
against the non-guaranteed tiers on price, and against the guaranteed ones only
when doing so does not put their delivery at risk. The practical upshot for this
site: a sponsorship always wins the impressions it targets, AdSense fills
everything else, and a house line item would only ever show when AdSense
declined — which is exactly the job the application's fallback already does
better, because it is contextual (§7).

## 2. What breaks, specific to this site

The generic migration steps are in Google's help pages. These are the ones this
repository will hit, in the order they would hurt.

### 2.1 The consent banner leaves with the AdSense tag

`ADVERTISING.md` §9 chose Google's Privacy & messaging _because_ the AdSense tag
loads the European regulations message itself — zero integration work. The
other side of that bargain arrives now: remove `adsbygoogle.js` and the banner
goes with it. Ad Manager has its own Privacy & messaging, the message has to be
created there against a site added in Ad Manager, and GPT is what loads it.

Two failures follow if that is missed, and neither raises an error anywhere:

- **Ads.** Without a certified CMP, Google serves no personalised ads to EEA,
  UK and Swiss readers, and without a TC string at all it may serve none.
- **Analytics.** [`../lib/analytics/consent.ts`](../lib/analytics/consent.ts)
  declares _denied_ as the default across those regions, and the banner is what
  updates it. No banner means every European GA4 hit stays denied indefinitely,
  and European traffic quietly thins out of the reports.

So the message is rebuilt in Ad Manager and verified _before_ the switch —
styled to match the AdSense one, whose limits `ADVERTISING.md` §9 records — and
checked afterwards from an EEA address: the banner appears, accepting it puts a
`consent update` on `dataLayer`, and `__tcfapi` answers. Whether a choice made
under the AdSense message carries over to the Ad Manager one is not documented;
assume it may not, and read a dip in the EEA consent rate in the first week as
expected rather than as a fault.

### 2.2 Sites must be approved before Google demand serves

Ad Manager serves AdSense and Ad Exchange demand only to sites on its Sites list
that it has approved, and approval is a review that takes days. Add
`beyondeveryart.com` (which covers `www`) on the first day, long before any code
is ready, so that it is not the thing the switch waits for.

### 2.3 `ads.txt` keeps its AdSense line

AdSense backfill inside Ad Manager sells as the same AdSense publisher, so the
committed record in [`../ads.txt`](../ads.txt) stays exactly as it is.
[`../tests/ads/adsense.test.ts`](../tests/ads/adsense.test.ts) pins that record
to `ADSENSE_CLIENT`; when the AdSense tag code is deleted, that constant has to
survive it — its job becomes "the publisher `ads.txt` authorises" rather than
"the publisher whose tag loads" — or the pin goes with it and the one-line file
loses the only test that says what it is for.

Ad Exchange, if it comes, adds records: its own seller id with your own
account, or the lines an MCM partner supplies. Those are a third party's records
on a file buyers read, which is a change the repository owner makes, per
[`../AGENTS.md`](../AGENTS.md).

### 2.4 The in-article format has to be rebuilt in the console

`article-inline` is AdSense's in-article unit — fluid, native-looking, sized by
the creative. GPT has no tag equivalent. Ad Manager reproduces it with an ad
unit whose size is **Fluid**, a native style set to **Google-designed for
in-article** with the site's fonts and colours, and a programmatic line item
(AdSense, or Ad Exchange) that delivers it; the style does not start under any
other line item type.

The alternative is to stop being fluid: `300x250` and `336x280` as a multi-size
unit. That has a real attraction here — the reservation becomes a promise again,
because a set of fixed sizes has a maximum, which is what
`ADVERTISING.md` §8's "reserve the maximum, always" wanted and could not have.
It was rejected once for forgoing the native look and its mobile fill, and that
argument has not changed.

**Recommended: parity first.** Ship fluid with the in-article native style, so
the switch compares tag with tag. Then test `['fluid', [300, 250], [336, 280]]`
as a separate step, measured. `336` fits the column only from a 384px viewport
up — the column is the viewport less `.container`'s 1.5rem padding each side —
so the display sizes need a size mapping, and the design test is where that
arithmetic belongs.

### 2.5 Client-side navigation outlives slots

AdSense needed a guard against pushing twice. GPT has the opposite problem. The
App Router moves between articles without loading a new document, and a GPT
slot is page-level state that outlives the component that defined it: a slot
not destroyed on unmount keeps its `div` id, its targeting and its place in the
next request. So:

- **define on mount, `googletag.destroySlots()` on unmount** — which also makes
  React's development double-mount harmless, where AdSense's push made it a
  hazard;
- **targeting per slot, not per page.** Page-level targeting set through
  `googletag.setConfig` persists across client navigations, so the previous
  article's topic would ride along on the next one's requests. Computed on the
  server per article, passed down as a prop, set on the slot, gone with it.

### 2.6 The Content-Security-Policy gets a documented path

`ADVERTISING.md` §3 called ad stacks and nonce-based policies genuinely in
tension. For the tag itself, GPT resolves it: Google's CSP guide for GPT
supports _only_ a strict, nonce-based policy — `'nonce-…' 'strict-dynamic'` in
`script-src` — and says outright that host allowlists are not supported because
its domains change. That is the policy
[`CONTENT_SECURITY_POLICY.md`](CONTENT_SECURITY_POLICY.md) phase 3 is heading
for anyway, and under `'strict-dynamic'` the script allowlist stops mattering.

What it does not resolve: the guide sets only `script-src`, `object-src` and
`base-uri`. The `frame-src`, `img-src` and `connect-src` lists in
[`../lib/security/csp.ts`](../lib/security/csp.ts) remain allowlists this
repository maintains from reports. It also recommends forcing SafeFrame —
`googletag.setConfig({ safeFrame: { forceSafeFrame: true } })` — so creatives
render cross-origin and do not inherit the page's policy. With no reservation
creatives on the network, the one caveat it names (creatives that expect a
same-origin frame) does not apply yet.

For the switch itself, with the policy still report-only: add
`securepubads.g.doubleclick.net` to the script and connect lists,
unconditionally, per §3's correction, and read the reports. One origin to look
for in those reports _now_: `fundingchoicesmessages.google.com`, which serves
the Privacy & messaging banner and is on none of the lists today. Under
`CSP_MODE=enforce` it would be blocked, and a blocked banner is §2.1's failure
without the switch.

### 2.7 Network time zone and currency lock at the first order

Both are set when the network is created and can be changed only until the
first order exists — and in the plan below the first order is created early, for
QA (§4). Settle them before that. **Currency:** the one AdSense pays in.
**Time zone:** the one the GA4 property reports in, so that a day in one console
is the same day in the other — every per-day comparison in §6 depends on it.

### 2.8 The layout's Google-tag flag

`app/(frontend)/layout.tsx` renders the consent default only where a Google tag
will load, and computes that from the analytics tag and the AdSense client. The
GAM network has to count, or a deployment with analytics off renders GPT with no
consent default in front of it. One line, and exactly the kind that is missed.

## 3. Naming conventions

### Principles

1. **Codes are for machines and are permanent; names are for people and are
   not.** An ad unit's _code_ is what the tag sends and what reports key on, and
   it cannot be changed after the unit is saved — a new code is a new unit with
   no history. Its _name_ is a label in the console and can say anything. Spend
   the care on codes.
2. **Lowercase only.** Ad Manager treats ad unit codes, key names and values as
   case-insensitive, so case carries no information and mixed case only creates
   near-duplicates.
3. **One grammar everywhere.** A hyphen joins words _within_ a token
   (`article-inline`, `acme-pigments`); an underscore separates tokens _in a
   name_ (`2026-11_acme-pigments_palette-month`); a slash appears only in ad
   unit paths. This is the repository's own kebab-case — placement names and
   tag slugs already follow it — so a value lifted from the code needs no
   translation.
4. **Where goes in the ad unit; what, who and which go in key-values.** Never
   encode a topic, tag, author, slug, date, size or device in an ad unit code.
   Tags here are merged and retired as a matter of routine —
   [`../lib/content/tag-plan.ts`](../lib/content/tag-plan.ts) exists to do it —
   and an ad unit code cannot follow them.
5. **Name what the slot is, never what fills it.** `ADVERTISING.md` §5's rule,
   applied to Ad Manager: no `adsense`, `gpt`, `native`, `300x250` or `sticky`
   in an ad unit code. Sizes and formats are settings on the unit and change;
   the code does not.
6. **Respect the limits.** Key names at most 20 characters, no spaces, not
   starting with a digit; values at most 40 characters; none of
   `" ' = ! + # * ~ ; ^ ( ) < > [ ] ,` in either. Leave the `hb_` and `amzn`
   prefixes free for header bidding, which writes its own keys.

### The ad unit tree

Two levels under the network: the property, then the placement.

```text
/<network>/
└── bea-web/                   Beyond Every Art — website
    ├── rail-1                 post rail · 300×250 · ≥1280px only
    └── article-inline         reading column · fluid · repeated by length (pos 1–12)
```

The leaf **is** the placement name from
[`../lib/ads/placements.ts`](../lib/ads/placements.ts), character for
character, so one vocabulary runs from the component to the report. The three
placements `ADVERTISING.md` §8 plans but has not built — `article-end`,
`archive-inline`, `home-mid` — get units when they get call sites, for the same
reason `placements.ts` does not list them: a name nobody has had to make work.

**Why a property level.** It is the one line that targets or excludes "all
website inventory", and it is where the rest of the family would go if this
network ever serves it — `bea-app`, `dapple-app` — without disturbing a single
existing code. Those are not created now; [`../AGENTS.md`](../AGENTS.md) is
clear about speculative app scope.

**Why not a template level** (`bea-web/article/rail-1`). The placement names
already carry their template, so it would read `article/article-inline`; and
`archive-inline` is one placement across three templates (journal, tag, author),
which a template level would split into three units. The template travels as
`pt` instead.

**Names**, being mutable, can be descriptive: "Rail 1 — post rail 300×250
(≥1280)". Put the repository path of this document in each unit's description,
so whoever opens the console finds the reasoning.

### Key-values

| Key     | Kind       | Values                                        | Set on | For                                                                                                                                                                          |
| ------- | ---------- | --------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pt`    | predefined | `article`, `journal`, `tag`, `author`, `home` | slot   | Roll-ups across units, and telling `archive-inline`'s three templates apart. Only `article` is sent until another template has a unit.                                       |
| `pos`   | predefined | `1`–`12`                                      | slot   | Which instance of a repeated unit, in reading order across both tiers. `rail-1` sends `1`, so a report grouped by position has no empty row.                                 |
| `tier`  | predefined | `all`, `mobile`                               | slot   | Whether an in-article slot is one every device renders or the phone-only one between them (`planInlineSlots`). Device category cannot tell them apart: a phone renders both. |
| `topic` | predefined | subject tag slugs, multi-valued               | slot   | Selling and reporting by subject. The article's tags that pass `isSubjectTag` in [`../lib/content/topics.ts`](../lib/content/topics.ts).                                     |
| `pid`   | dynamic    | the Payload post id                           | slot   | Single-article sponsorship. The id, not the slug: slugs can exceed 40 characters, ids cannot, and ids never change.                                                          |
| `qa`    | predefined | `1`                                           | slot   | Forces the QA line items (§4). Read from `?adqa=1` in the browser.                                                                                                           |

**Predefined where the code owns the set, dynamic where it cannot.** `pt`,
`pos` and `tier` are closed sets the code decides. `topic` is predefined because the
subject tags are few and change deliberately, which makes "add the value in Ad
Manager" a step in the tag-plan routine rather than a surprise. `pid` is
unbounded and needed only for a one-off deal, so it is dynamic.

**`qa` is read in the browser, not on the server.** Reading `searchParams` in
the article's server component would opt a statically rendered page out of
static rendering for the sake of a debugging switch.

**Never anything about the reader.** No member status, email, account or
subscriber id, hashed or otherwise — Google's policies prohibit PII in
key-values, and [`../AGENTS.md`](../AGENTS.md) puts member data behind a stop
sign anyway. Ad-free membership, when it comes, is `eligibility` answering no,
not a key-value answering "member".

Reserved but not created: `ab`, for the day unit density is tested as an
experiment rather than argued about.

### Orders, line items, creatives

| Object               | Pattern                                                   | Example                                          |
| -------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| Company (advertiser) | The business's own name, as it would appear on an invoice | `Acme Pigments`, `Beyond Every Art (house)`      |
| Order                | `<yyyy-mm>_<advertiser>_<campaign>`                       | `2026-11_acme-pigments_palette-month`            |
| Line item            | `<campaign>_<type>_<unit>_<size>[_<key>-<value>]`         | `palette-month_spn_rail-1_300x250_topic-palette` |
| Creative             | `<advertiser>_<campaign>_<size>_v<n>`                     | `acme-pigments_palette-month_300x250_v1`         |

**Type tokens:** `spn` sponsorship, `std` standard, `pp` price priority, `net`
network, `bulk` bulk, `house` house, `ads` AdSense, `adx` Ad Exchange, `qa`
test. **Sizes:** `300x250`, `fluid`. **Dates:** ISO, year first, so a sorted
list is a chronological one.

Companies are the one exception to the grammar: they are a record of a third
party, named as that party names itself. `Acme Pigments` is a placeholder
throughout.

The worked example, end to end — a pigment maker sponsors the rail on every
Palette article through November:

- company `Acme Pigments`
- order `2026-11_acme-pigments_palette-month`
- line item `palette-month_spn_rail-1_300x250_topic-palette`, sponsorship,
  targeting ad unit `bea-web/rail-1` and `topic` is `palette`
- creative `acme-pigments_palette-month_300x250_v1`

Read back from a report, every token answers a question without opening the
object.

### Everything else that gets a name

| Object                          | Prefix   | Example                                  |
| ------------------------------- | -------- | ---------------------------------------- |
| Ad Manager placement (grouping) | `pkg_`   | `pkg_article-all`                        |
| Unified pricing rule            | `upr_`   | `upr_article-inline_usd-0.40`            |
| Protection                      | `prot_`  | `prot_sensitive-categories`              |
| Native style                    | `style_` | `style_article-inline_google-in-article` |
| Saved report                    | `rpt_`   | `rpt_weekly_units-by-pos`                |
| Label (exclusion, frequency)    | `lbl_`   | `lbl_competing-pigments`                 |

A prefix makes the object's kind legible wherever its name turns up alone — a
CSV export, an email, a change log — and `pkg_` in particular keeps Ad
Manager's placements from being read as this repository's.

### Ids on the page

GPT needs a unique `div` id per slot. Derive it from the placement and position
— `slot-rail-1-1`, `slot-article-inline-3` — so a slot in the Publisher Console
names its placement without a lookup.

**Avoid `div-gpt-ad`, `ad-` and `gpt-` prefixes.** The first is the one in
Google's own examples, and EasyList's generic cosmetic rules hide it by prefix
(`##[id^="div-gpt-ad"]`); the other two are hidden by hundreds of specific
entries (`###ad-slot-1`, `###gpt-ad-1`). EasyList also carries `##.ad-slot`,
which is the class on this site's own wrapper today. That
last one is a finding about the current build, not a naming preference: for a
reader whose blocker uses EasyList, the whole `.ad-slot` box is hidden before
it paints, fallback included. Nothing shifts, because it is hidden from the
start; but the house content that `ADVERTISING.md` §8 put there for blocked
readers is seen by blockers working at the DNS level and not by the most common
browser extensions. Whether that is a problem to fix or the right outcome — no
box at all is also not a labelled empty box — is the owner's call, and it does
not block this plan.

## 4. Console setup, in order

Owner work, in Ad Manager and AdSense. Nothing here needs code, and the first
three should start before any code is written, because they wait on Google.

1. **Create the network** from the AdSense account (a valid AdSense account is
   a requirement of the free tier), named Beyond Every Art.
2. **Set time zone and currency** under Admin → Global settings → Network
   settings, per §2.7, before anything else.
3. **Add the site** under Inventory → Sites and wait for approval (§2.2).
4. **Confirm the AdSense link** and that AdSense backfill is on at the network
   level — "Maximize revenue of unsold and remnant inventory with AdSense" — so
   units inherit it.
5. **Rebuild the European regulations message** under Privacy & messaging, for
   the site, matched to the AdSense one; confirm its consent mode setting
   updates Google tags (§2.1). Publishing it early is harmless: nothing loads it
   until GPT is on the page.
6. **Port the protections.** Whatever is blocked in AdSense's blocking controls
   gets an equivalent `prot_` protection here; then check both places, since
   backfill passes through both.
7. **Create the ad units** in §3's tree. `rail-1`: `300x250`. `article-inline`:
   `Fluid`. No refresh declared on either — nothing refreshes
   (`ADVERTISING.md` §8), and a declaration is a statement to buyers.
8. **Create the key-values** in §3, with `pt`, `pos` and `topic` reportable;
   seed `topic` from the subject tags.
9. **Create the in-article native style** (§2.4) and the programmatic line item
   that delivers it into `article-inline`.
10. **Create the QA order**: company `Beyond Every Art (house)`, order
    `qa_placement-check`, one sponsorship line item per unit targeting `qa` is
    `1`, each with a flat-colour creative that prints its own unit and size.
    Sponsorship so it always wins when asked; the key-value so it is never
    asked otherwise. `?adqa=1` on any article then shows every slot, labelled,
    without a real impression being spent or a real ad being clicked.

## 5. Code changes in this repository

Small, because `ADVERTISING.md` §5 put the seam in the right place. In the
order they would be written:

- **`lib/ads/gam.ts`** — the network code, committed as `ADSENSE_CLIENT` is,
  and a resolver with the same three rules as `resolveAdsenseClient`: nothing on
  a non-indexable deployment, nothing when switched off, nothing for a malformed
  code. Plus the GPT script URL.
- **The provider switch.** A server-only `ADS_PROVIDER` — `adsense`, `gam` or
  `off` — read by the layout at runtime and passed down as props, so flipping it
  is a restart, not a rebuild (`ADVERTISING.md` §5 on why not `NEXT_PUBLIC_*`).
  `NEXT_PUBLIC_ADSENSE_CLIENT=off` stays the AdSense kill switch until the
  AdSense path is deleted.
- **`lib/ads/placements.ts`** — `GAM_UNITS`, keyed by `Placement`, beside
  `AD_SLOTS`. `SlotSize` stays the discriminated union it is; a multi-size
  variant arrives with §2.4's second step, not before.
- **`lib/ads/targeting.ts`** — one pure function from the page's context to a
  slot's key-values, which enforces §3's limits (drops a value over 40
  characters or carrying a reserved character, rather than sending it), and is
  unit-tested like the rest of `lib/ads/`.
- **`app/(frontend)/components/gpt.tsx`** — the loader, a plain
  `<script async>` with `crossOrigin`, for the same reasons
  [`<../app/(frontend)/components/adsense.tsx>`](<../app/(frontend)/components/adsense.tsx>)
  gives. No inline bootstrap: the client component does
  `window.googletag ??= { cmd: [] }` itself, which keeps an inline script off
  the list phase 3 has to nonce.
- **`AdUnit`** splits in two. The box — label, reservation, fallback, `data-fill`
  — stays what it is and knows nothing about networks. The request becomes a
  small per-provider piece: for GPT, define the slot when the breakpoint and
  idle gates in today's component open, set its targeting, display it, destroy
  it on unmount. This is the `providers` module `ADVERTISING.md` §7 deferred
  until a second provider existed; one now does.
- **The fill signal gets simpler.** GPT's `slotRenderEnded` event says
  `isEmpty` outright, replacing the `data-ad-status` read. The three-second
  timeout stays, for a GPT that a blocker stopped from loading — no events ever
  arrive then — and Google's word still wins whenever it comes.
- **Page configuration**, once: `singleRequest: true`; `lazyLoad` with the
  fetch one viewport ahead, the render a quarter of one ahead (roughly §8's
  200px on a 900px screen) and `mobileScaling: 2` as a starting point to tune
  from viewability; `safeFrame.forceSafeFrame` per §2.6; collapsing left off,
  because the reserved height is the whole defence against layout shift.
- **Keep the breakpoint in one place.** GPT's size mapping could also suppress
  `rail-1` below 1280px, but `minViewportWidth` already does, is tested against
  the stylesheet, and keeps listening when a window widens — which a size
  mapping does not. Two sources of truth for one breakpoint is how the rail
  last went wrong.
- **`slotRenderEnded` also reports the served size.** Sending it to GA4 as an
  event per placement answers the question `SLOT_SIZES` leaves open for the
  fluid unit — whether 280px is too much or too little — from real creatives.
- **Tests.** Every placement has a unit; every path is under the committed
  network (a path under someone else's network does not error, it never fills —
  the same pin the AdSense slot ids have); the targeting function's limits; the
  consent flag in §2.8; the new CSP origins; and the existing "pushed once,
  never refreshed" check restated for GPT as "never calls `refresh`".

Types: Google publishes GPT's TypeScript definitions as
`@types/google-publisher-tag`, which replaces the hand-written `Window`
declaration `ad-unit.tsx` carries for `adsbygoogle`.

## 6. Rollout and rollback

1. **Baseline, two to four weeks, before anything changes.** Per unit:
   impressions, RPM, viewability, fill. Per country group: RPM and — from the
   Privacy & messaging report — EEA consent rate. And the article template's
   CLS and LCP. Without these, the comparison afterwards is an impression.
2. **Ship the code with `ADS_PROVIDER=adsense`.** The build carries the GPT
   origins and the GAM path, dormant. Verify on production with `?adqa=1` that
   nothing changed.
3. **Flip to `gam`**, mid-week and not in the week of a large editorial push.
   Check immediately: `?adqa=1` shows every slot labelled; the Publisher
   Console (`?google_console=1`, then Ctrl+F10) lists the slots with the right
   paths and targeting; the banner appears from an EEA address (§2.1); CSP reports show
   nothing unexpected.
4. **Watch the first 48 hours for European fill.** It is the number that tells
   you the banner works. A collapse there means roll back first and investigate
   second.
5. **Compare after two to four weeks**, expecting parity. AdSense backfill is
   paid through AdSense and appears in both consoles — use Ad Manager as the
   ledger, because it has the per-position breakdown, and never add the two.
6. **Roll back** by setting `ADS_PROVIDER=adsense` and restarting the
   container. That is the entire procedure while the AdSense path exists.
7. **Delete the AdSense path** after about a month without a rollback — the
   component, the loader, `AD_SLOTS`, the kill-switch variable — keeping
   `ADSENSE_CLIENT` as the `ads.txt` publisher (§2.3) and the `ads.txt` line
   itself.

A split test — half the sessions on each tag — is the textbook alternative. At
this site's traffic it would not reach a conclusion in any reasonable time, and
it doubles every failure mode above. A clean before/after with a one-restart
rollback is the more honest experiment here.

## 7. What not to do

- **Run `adsbygoogle.js` and `gpt.js` on one page.** Two consent banners, two
  counts of the same reader, and AdSense's Auto ads free to place units if they
  are ever switched on. One provider per request, decided on the server.
- **Collapse empty slots.** GPT offers it; §8's reservation rule forbids it.
- **Refresh.** Not the sticky rail, not on a timer, not "just the in-article
  ones". §8 settled it, and a refresh declared to buyers is not taken back
  quietly.
- **Mistake GPT's side rails for the rail.** GPT has out-of-page formats called
  left and right _side rails_, which Google positions in the page's gutters on
  wide screens. They are a different thing from `rail-1`, which is an in-page
  slot in this site's own track; and they, anchors and interstitials are all
  excluded by `ADVERTISING.md` §4's argument against placements the site does not
  decide.
- **Use house line items for the fallback.** They would count as filled, eat the
  `isEmpty` signal the fallback depends on, and serve something generic where
  the application serves something related to the article.
- **Add Google Tag Manager to carry GPT.** `consent-mode.tsx` explains why the
  consent ordering is safe today, and a container that fires on load is the
  named exception.
- **Build header bidding.** `ADVERTISING.md` §6: a managed partner at the
  thresholds it lists replaces the stack, and brings its own Ad Manager network
  through MCM. What survives that is the placement names, the eligibility
  predicate, the reservations and the naming here — which is the argument for
  getting the naming right rather than the stack elaborate.

## Google's pages this relies on

Checked on 26 Sep 2026. These move; re-read the relevant one before acting on
a claim above that it supports.

- [Sign up for Ad Manager](https://support.google.com/admanager/answer/7084151) —
  the AdSense requirement; time zone and currency locking at the first order.
- [Ad unit codes and names](https://support.google.com/admanager/answer/10477476)
  — permitted characters, 100-character limit, case-insensitivity.
- [Valid key-value entry](https://support.google.com/admanager/answer/10020177)
  — the 20- and 40-character limits and the reserved characters.
- [Create a European regulations message for sites](https://support.google.com/admanager/answer/10076098)
  — Privacy & messaging in Ad Manager, loaded by GPT.
- [Fluid size for native ads](https://support.google.com/admanager/answer/9178980)
  — how the in-article unit is reproduced.
- [Integrate with a Content Security Policy](https://developers.google.com/publisher-tag/guides/content-security-policy)
  — GPT's strict-CSP-only stance and `forceSafeFrame`.
- [Config API migration](https://developers.google.com/publisher-tag/guides/config-migration)
  — `setConfig` in place of the deprecated `pubads()` setters.
- [Limited ads](https://support.google.com/admanager/answer/9882911) — served
  automatically from the CMP's signal, which is why the ordinary GPT URL is the
  right one here rather than the limited-ads variant.
