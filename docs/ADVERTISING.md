# Advertising

An evaluation of putting ad units on the site: what is in the way, what the
architecture should be so that AdSense is not a one-way door, where the units
go, and in what order the work should happen. Nothing here is built except the
`/ads.txt` serving fix described in §1.

Related: [`CONTENT_SECURITY_POLICY.md`](CONTENT_SECURITY_POLICY.md),
[`DEPLOYMENT_STATUS.md`](DEPLOYMENT_STATUS.md),
[`ACCOUNT_MODEL.md`](ACCOUNT_MODEL.md),
[`INSERTABLE_CONTENT_MODULES.md`](INSERTABLE_CONTENT_MODULES.md),
[`../PRODUCT.md`](../PRODUCT.md).

## Verdict

Display advertising is a reasonable fit for this site and the architecture to
support it is small — perhaps a day of work for the layer itself. It should not
ship yet, for reasons that have nothing to do with the code:

1. The site has not cut over. It is `noindex` and behind Basic Auth, so Google
   cannot review it, and an AdSense application reviewed in that state is an
   application that gets declined.
2. There is no consent management platform. For EEA/UK traffic that is not a
   nice-to-have, it is the thing Google requires before it will serve ads at
   all.
3. `/ads.txt` is served on Ghost by a redirect, and neither that redirect nor
   the root file survives the cutover — the redirect because middleware skips
   dotted paths, the file because Next does not serve the repository root.
   Closed here, and worth reading because the redirect half fails silently.

The order that follows from this is: settle ads.txt (done), build consent, cut
over, apply, then wire the ad layer behind a flag. §7 lays it out, §8 plans the
placements, and §9 evaluates the consent platforms.

The more important point is in §6: **the ceiling on RPM is traffic, not
architecture.** Futureproofing the code is cheap and worth doing, but it is not
what stands between this site and a better RPM, and it would be a mistake to
spend a lot of engineering on a header-bidding stack that a managed partner
would later replace wholesale.

## 1. `/ads.txt` does not survive the cutover on its own

On Ghost the file at the repository root is not what serves `/ads.txt` — a
Ghost redirect does, and the root file is the record of what that redirect
points at. That arrangement works today and stops working on cutover day, in a
way worth being precise about, because **both** of the mechanisms that could
carry it over are currently broken.

**The static file does not serve.** Next.js serves static assets from `public`
and nowhere else, so the repository root was never a path Next would answer.
The production image compounds it: `next.config.ts` sets `output: 'standalone'`,
which traces the server's imports and deliberately skips `public` on the
assumption that a CDN serves it. Nothing does here — the Caddyfile has no
`file_server` and no `root`, it reverse proxies every path to the app container
— and the `Dockerfile` copied `.next/standalone` and `.next/static` and
stopped.

**The migrated redirect does not fire either.** This is the one that would have
been found the hard way. The Ghost redirect is importable — there is a
`Redirects` collection and `scripts/migrate-redirects.ts` to fill it — but the
middleware that resolves redirects never sees the request. Its matcher in
`middleware.ts` excludes any path containing a dot:

```
'/((?!_next/static|…|rss|.*\..*).*)'
```

`/ads.txt` contains a dot, so it is skipped before any redirect lookup happens.
So is `/app-ads.txt`, and so is `/sellers.json`. The exclusion is correct for
its purpose — it is there to keep asset requests out of the redirect map — but
it means a redirect row for `/ads.txt` can sit in the database looking
perfectly configured and never run.

This matters more than a missing file usually would. An `ads.txt` that 404s is
not a degraded `ads.txt` — buyers treat an unreadable file as an absent one,
which makes the inventory unauthorised. The file exists precisely to prevent
that, so a broken one inverts its own purpose.

**What is now in place.** The static route, because it is the correct shape for
a single AdSense record and needs no exception to the middleware:

- the file lives at `public/ads.txt`;
- the `Dockerfile` runner stage copies `public` into the image;
- [`../tests/seo/ads-txt.test.ts`](../tests/seo/ads-txt.test.ts) fails if
  either of those stops being true, and also checks record formatting and the
  trailing newline (it was committed without one, and some parsers drop an
  unterminated final record — which, in a one-record file, is all of them).

**If the redirect is the behaviour you want to keep**, that is a Caddy rule
rather than a middleware change — a `redir /ads.txt <target> permanent` in the
site block, evaluated before the catch-all `reverse_proxy`. Prefer that to
loosening the middleware matcher, which would put every dotted path in the site
through a redirect-map lookup to fix one file. The two are mutually exclusive:
a file at `public/ads.txt` is served by the app and a Caddy `redir` never
reaches it, so pick one. The end of §6 covers when the redirect becomes the
better answer, which is the day a managed partner hosts the file.

Either way this is a cutover checklist item, not a launch-day discovery. Verify
after the next deploy by fetching `https://<domain>/ads.txt` and reading the
body, not the status code. Note that `trailingSlash: true` does not apply to
files in `public`; they are served at the exact path.

## 2. Consent is the real blocker

There is no cookie consent system in this repository. Grepping for one finds
the OAuth consent screen and the newsletter signup's consent line, and nothing
else.

Google has required a certified consent management platform for AdSense,
Ad Manager and AdMob traffic from the EEA, UK and Switzerland since January
2024, and the framework version has since moved — TCF v2.3 became mandatory on
1 March 2026. Without a CMP certified at the current version, ads to those users
are not served, and this is enforced by Google rather than merely advised. §9
evaluates the options, including why the open-source ones cannot be used here.

Two things follow that are easy to get wrong:

**GA4 already has this problem.** `app/(frontend)/components/analytics.tsx`
loads the GA4 tag unconditionally whenever `NEXT_PUBLIC_GA_ID` is set and the
deployment is indexable. There is no consent gate in front of it. That is an
existing gap rather than something ads introduce, but ads make it sharper:
advertising cookies are unambiguously non-essential, and a site running a
consent banner that only governs half its tags is in a worse position than one
running no banner at all, because it has now made a claim.

**Consent has to be an input to the ad layer, not a wrapper around it.** The
tempting shape is a banner component that conditionally renders the ad script.
That breaks as soon as there are two tag consumers, because consent then has
two sources of truth. The shape that holds is a single resolved answer —
Google Consent Mode signals, plus whatever the application needs — that both
analytics and ads read.

## 3. Content-Security-Policy collides with this

`lib/security/csp.ts` is currently in report-only, and
[`CONTENT_SECURITY_POLICY.md`](CONTENT_SECURITY_POLICY.md) describes phase 3 as
moving to nonces so `'unsafe-inline'` can come out of `script-src`. That plan
and display advertising are in genuine tension, and it is better to say so now
than to discover it halfway through phase 3.

Ad tags load code from a wide set of Google origins — `googlesyndication.com`,
`doubleclick.net`, `googletagservices.com`, the ad traffic quality endpoints,
`gstatic.com` — and creatives frame and fetch from more. The list is not
published as a stable contract and it changes. Ad tags also write inline script
and inject script elements that do not carry your nonce, which is the specific
reason nonce-based policies and ad stacks are hard to run together. In practice
publishers who run ads keep `'unsafe-inline'`, or maintain a policy that
periodically breaks a creative.

The good news is that the existing code already has the right shape for this.
`ANALYTICS_SCRIPT_ORIGINS`, `ANALYTICS_CONNECT_ORIGINS` and
`ANALYTICS_IMG_ORIGINS` are gated on `NEXT_PUBLIC_GA_ID` being set — origins
appear in the policy only when the thing that needs them is switched on. Ad
origins should follow that pattern exactly, gated on the ad provider being
configured, so a deployment with ads off has no ad origins in its policy.

The report-only phase is also, conveniently, the right place to do this. Turn
the ad tag on with the policy still in report-only and the violation reports
arriving at `app/csp-report/route.ts` become an empirical inventory of the
origins actually used — which is a far better list than one assembled from
documentation, and the doc already says to extend `frameOrigins` from reports
rather than from guesswork.

## 4. Where the units go, and the two wrinkles

The obvious placements are a leaderboard below the article header, one in-body
unit, one below the article, and one in the archive/tag listings. Two things
about this codebase complicate the in-body one.

**Legacy Ghost bodies cannot hold a block.**
`app/(frontend)/components/body.tsx` has two branches. Lexical content renders
through the block registry, so an ad placement there could be an insertable
block alongside the existing `paywall` marker — that pattern already exists and
costs no migration, per
[`INSERTABLE_CONTENT_MODULES.md`](INSERTABLE_CONTENT_MODULES.md). Preserved
Ghost markup goes through `dangerouslySetInnerHTML` and never sees a block, and
that is most of the migrated archive.

So a mid-article unit on migrated posts needs either client-side DOM injection
after hydration — which causes layout shift and fights the CSP — or a
server-side split of the HTML at a top-level paragraph boundary, rendering a
slot between the halves. The second is better: deterministic, no shift, no
hydration mismatch, and testable as a pure function. It is also the only one of
the two that a strict CSP is comfortable with.

**Restricted posts should not carry ads.** `post.restricted` renders a teaser
plus `MembershipGate`. A truncated article with ads on it is thin content in
the sense AdSense's policies care about, and it is also the worst possible
reader experience at the exact moment you are asking someone to subscribe. The
same reasoning applies to empty search result pages. Both should be excluded by
the eligibility rule in §5 rather than by remembering not to place a unit
there.

There is a third consideration that is not technical. [`../PRODUCT.md`](../PRODUCT.md)
names, as explicit anti-references, "generic blog homepage grammar" and
anything that undercuts the premium-publication feel. Display advertising works
against that brief. This is not an argument against ads — it is an argument for
few units, placed deliberately, with reserved space so nothing jumps, and for
treating ad-free as a member benefit when memberships open. Auto Ads, which
inject units wherever Google's model likes, are the wrong tool for this site
specifically: they will place units in the middle of the reading experience and
they are the single largest cause of layout shift on ad-supported sites. Use
explicit units.

## 5. The architecture

Small, and shaped like the code around it. `lib/security/csp.ts` and
`lib/seo/indexing.ts` are both pure, env-driven and unit-tested rather than
inspected in a browser; the ad layer should be a third instance of that, in a
`lib/ads/` directory.

| Module        | Responsibility                                                                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config`      | Read the environment into a resolved configuration, or null when ads are off. One place that decides "are ads on".                                                         |
| `providers`   | The provider contract, and an AdSense implementation of it. A provider declares its script origins, frame origins, connect origins, its loader, and how it renders a slot. |
| `placements`  | Placement names as a public contract — `article-top`, `article-mid`, `article-end`, `archive-inline`.                                                                      |
| `eligibility` | One predicate: should this request see ads.                                                                                                                                |

The placement names are the part that does the futureproofing, and they work
the same way `BLOCK_SLUGS` in `blocks/schema.ts` does: a name for what the
slot _is_, never for what fills it. `article-mid` maps to an AdSense slot ID
today and to some other partner's unit later, and no component that renders an
ad ever knows which. That mapping is the only thing a provider swap touches.

`eligibility` earns its own module because it is where four unrelated
conditions meet, and each of them is a bug if it is checked in only some of the
places a unit appears:

- the deployment is indexable (`isNoindex()` — no ads on staging, same reason
  analytics does not run there);
- the reader has consented, where consent is required;
- the post is not a restricted teaser;
- later, the reader is not a paying member.

The last one is why this exists now rather than later. [`ACCOUNT_MODEL.md`](ACCOUNT_MODEL.md)
ships no reader accounts in Phase 1, so there is no member to check — but the
call site should take the answer from `eligibility` from the first commit, so
that turning on ad-free membership is a change in one function rather than a
hunt through every template.

Two smaller notes on the shape:

**Reserve the height in this repository's CSS, not the provider's.** Every slot
renders a container with an explicit `min-height` per breakpoint before
anything fills it. This is the entire defence against layout shift, it is the
one thing no ad provider will do correctly for you, and it must survive a
provider swap — so it belongs to the slot component, keyed on placement, not to
the provider.

**Prefer a server-only variable for the publisher ID.** The `Dockerfile` has a
scar on this: `NEXT_PUBLIC_*` values are substituted into the client bundle at
build time, which is why the checkout URLs had to become build arguments after
they silently did nothing when supplied at runtime. An ad configuration read
server-side from a non-public variable and passed down as a prop — the way
`layout.tsx` already passes `gaId` to `Analytics` — is configurable on the VPS
without a rebuild. Anything the browser genuinely needs can travel as a prop.

## 6. Futureproofing, honestly

The request behind this evaluation is "AdSense now, better RPM later". The
architecture above makes the swap cheap, and it is worth building for that
reason. But it should be clear what the abstraction does and does not buy.

**What gates a better RPM is traffic volume, not code.** The managed
programmatic partners that pay materially better than AdSense have entry
requirements, approximately — verify current numbers, they move:

| Partner              | Rough threshold       |
| -------------------- | --------------------- |
| Ezoic                | effectively none      |
| Journey by Mediavine | ~10k sessions/month   |
| Monumetric           | ~10k pageviews/month  |
| Mediavine            | ~50k sessions/month   |
| Raptive              | ~100k pageviews/month |

Until the site clears one of those, the ad layer's provider slot has exactly
one thing that can go in it. That is fine — it just means the abstraction
should stay thin, because it is speculative for now.

**Geography matters more than the partner.** Session RPM is dominated by the
mix of where readers are; US, UK, Canadian and Australian traffic is what pays,
and an art and materials publication with a heavily non-Anglophone readership
will see low RPMs from any partner. Before investing in monetisation
engineering, look at the GA4 geography split. It predicts the outcome better
than the choice of ad network does.

**Managed partners bring their own stack.** Mediavine and Raptive supply a
script that handles bidding, lazy loading and placement itself; they largely
replace whatever you built. This is the strongest argument for not building a
Prebid header-bidding setup now. It is a substantial piece of work, it needs
ongoing tuning, and the most likely outcome of growing into better RPMs is that
it gets deleted. The parts that genuinely survive a partner change are the four
in §5 — placement names, eligibility, height reservations, and one place that
loads a script — and those are cheap.

**One consequence for `ads.txt`.** Managed partners require their own records,
often hundreds of lines, and typically ask you to redirect `/ads.txt` to a file
they host so it stays current without a deploy. That is a Caddy rule when the
time comes, and it is worth knowing now so that nobody builds elaborate
generation machinery for a file that will eventually be a redirect. The current
static file is right for AdSense.

## 7. Sequence

1. **Done.** `public/ads.txt` is served and tested.
2. **Consent management.** A prerequisite for ads rather than a part of them.
   §9 recommends Google's Privacy & messaging to start; the work in this
   repository is reading Consent Mode v2 signals and retrofitting GA4 behind
   them, not building a banner.
3. **Cut over.** [`DEPLOYMENT_STATUS.md`](DEPLOYMENT_STATUS.md) item 7 — unset
   `NEXT_PUBLIC_NOINDEX` and `STAGING_BASIC_AUTH`. Nothing about advertising
   can be evaluated before this, including the AdSense application itself.
4. **Let traffic establish, then apply to AdSense.** Applying against a site
   with no organic traffic history and a fresh domain configuration invites a
   decline that is slow to appeal.
5. **Build `lib/ads/`, off by default.** Ship it configured off, exactly as
   analytics is when `NEXT_PUBLIC_GA_ID` is unset. Merged and dormant is a
   safer state than a branch that rots.
6. **Turn it on with the CSP still in report-only**, and read the violation
   reports to build the real origin list before enforcement.
7. **Two or three units, measured.** Watch CLS and LCP against the current
   baseline, and session RPM by geography. Add units only against numbers.
8. **Revisit partners at the thresholds in §6.**

Steps 2 and 3 are the ones with real cost. Everything after them is small.

## 8. The placement plan

Placements are decided here, in advance, rather than discovered by dragging
units around a live site. Two constraints from this codebase set most of the
answers, and both are measured rather than assumed.

**The reading column is 704px, so a leaderboard does not fit in it.**
`.article__inner` is `max-width: 44rem` and `.container` adds `1.5rem` of
padding either side. The usable width inside an article is therefore 704px at
every viewport above that — narrower than the 728px of a standard leaderboard,
and far narrower than 970px. In-article units must be sized for 704px or less:
336×280, 300×250, or a responsive unit capped at the column. The 72rem
container on listing pages is a different story — 1104px usable, where the wide
formats do fit.

**The featured image is the LCP element.** `FeaturedFigure` renders with
`priority`, which is Next telling the browser this is the largest contentful
paint. Anything placed above it competes with it for the network and pushes it
down the page. So there is no header unit and no unit above the featured image
in this plan, at any breakpoint. That is the single most valuable inventory
slot on most sites and it is deliberately left empty here; taking it would cost
LCP on every article, which is the page type the whole site exists to serve.

### Inventory

| ID                 | Template             | Position                               | Desktop             | Mobile  | Reserved    |
| ------------------ | -------------------- | -------------------------------------- | ------------------- | ------- | ----------- |
| `article-inline-1` | `/[slug]` post       | After the 3rd body block               | 336×280             | 300×250 | 280 / 250px |
| `article-inline-2` | `/[slug]` post       | After the 9th body block               | 336×280             | 300×250 | 280 / 250px |
| `article-inline-3` | `/[slug]` post       | After the 15th body block              | 336×280             | 300×250 | 280 / 250px |
| `article-end`      | `/[slug]` post       | Below the author card, above Read Next | 728×90 → capped 704 | 300×250 | 90 / 250px  |
| `archive-inline`   | journal, tag, author | After every 6th entry row              | 970×250             | 300×250 | 250px       |
| `home-mid`         | `/`                  | Between Featured and Topics            | 970×250             | 300×250 | 250px       |

Six identified placements, of which **three should be live at launch**:
`article-inline-1`, `article-end`, and `archive-inline`. The rest are defined
so the slots exist and the names are stable, and enabled later against
measurements rather than optimism.

### Rules that go with it

**Cap in-article density by length, not by count.** `article-inline-2` renders
only if the body has at least 14 block-level children, `-3` only at 20. A
600-word piece gets one unit; a 4,000-word pigment-chemistry essay gets three.
The alternative — a fixed count — puts three units in a short post, which is
where ad density complaints and Better Ads Standards violations come from. Keep
total ad area under roughly 30% of page height on mobile, which is the
Coalition for Better Ads threshold Chrome enforces.

**Never split a figure from its caption.** Insertion counts top-level block
children of the body and must skip a position that would land between a
`figure` and text that reads as its continuation, and between a heading and the
paragraph beneath it. For migrated Ghost bodies this is a server-side HTML
split (§4); for Lexical bodies it is an index into the node list. Both need the
same rule, so it belongs in `lib/ads/` next to the placement names, not in
either renderer.

**Reserve the maximum, always.** Each slot renders its reserved height before
anything fills it, from this repository's CSS, keyed on placement and
breakpoint. A 90px banner landing in a 250px reservation leaves whitespace;
that is the correct trade. Zero layout shift is the requirement, and an unfilled
slot must collapse to zero only on a subsequent navigation, never mid-view.

**Label every unit.** A small "Advertisement" cap above each slot, inside the
reserved height so it costs no extra shift. This is an editorial-integrity
requirement before it is a policy one: [`../PRODUCT.md`](../PRODUCT.md)
describes a publication whose credibility is the product, and an unlabelled
display unit inside a materials-science essay reads as an endorsement.

**Lazy-load everything below the fold** at roughly 200px of viewport margin.
It improves LCP, and it improves viewability, which is itself an RPM input —
this is one of the few places where the UX-friendly choice is also the
revenue-friendly one.

**Excluded, deliberately:** the newsletter page and both `apps` templates
(conversion pages, where a competing call to action costs more than the
impression earns); restricted teasers and the 404; and search results, which
can legitimately be empty and would put ads on a page with no content. The
homepage cover, the hero, and everything above the article's featured image are
excluded by the LCP rule above. All of this is enforced by the `eligibility`
predicate in §5 rather than by remembering where not to place a unit.

**Re-measure per placement, not in aggregate.** Session RPM by geography is the
headline number, but the decision to keep a unit is per slot: viewability,
RPM contribution, and the CLS/LCP delta of that specific placement against the
current baseline. A unit that earns well and costs 0.05 CLS is not obviously
worth keeping, and only per-slot numbers can tell you.

## 9. Consent management platforms, free and open source

The evaluation asked for was open-source or free options. The honest finding is
that those are two very different lists, and only one of them can legally serve
ads in Europe.

**The bar has moved since §2 was written.** Google has required a certified CMP
since January 2024, but the framework version moved: IAB TCF **v2.3** became
mandatory for publishers and CMPs on **1 March 2026**, and Google stopped
treating v2.2 strings as equivalent after 28 February 2026. That date has
passed. A v2.2-only CMP today produces consent strings Google treats as
invalid, which drops ad requests to limited ads. So the question is not "is it
TCF" but "is it certified at v2.3, now".

### Open source is out, and it is worth knowing why

Klaro (BSD-3) and vanilla-cookieconsent (MIT) are both good libraries, both
genuinely self-hostable, and both **unusable for this purpose**. Neither
implements IAB TCF, and TCF is not a feature you can add to a library from the
outside: a CMP has to be registered with IAB Europe, assigned a CMP ID, and
certified by Google against its validation logic. That is an organisational
process with an annual fee, not a code change — which is why essentially no
self-hosted open-source CMP appears on Google's certified list, and why the
IAB's own tracker for this has sat open for years.

This is a real constraint rather than a preference, and it is the single most
common mistake in this area: a site installs Klaro, shows a beautiful banner,
believes it is compliant, and serves limited ads to every European reader
without any error surfacing anywhere.

Open source stays viable for one narrower job — consent for the site's _own_
cookies and GA4, with no ad vendors involved. If advertising were dropped from
the plan, Klaro would be the recommendation. It is not compatible with the plan
as it stands.

### The free certified options

| Option                               | Cost                            | Notes                                                                                                                                                     |
| ------------------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Google Privacy & messaging**       | Free, unlimited                 | Built into the AdSense console as the "European regulations" message. Google-certified by construction. Zero integration work — the AdSense tag loads it. |
| **InMobi CMP** (ex-Quantcast Choice) | Free tier, no pageview cap      | The most widely deployed independent free CMP; TCF v2.3. Worth it if you outgrow Google's, or want a CMP that is not your ad network.                     |
| **consentmanager**                   | Free to 3,000 pageviews/mo      | Certified v2.2 and v2.3. The cap is low enough to be a trial rather than a plan.                                                                          |
| **CookieYes / Flexy Consent**        | Free tiers, ~5,000 pageviews/mo | Certified. Same caveat — the free tier is a pilot.                                                                                                        |

**Recommendation: start with Google's Privacy & messaging.** For an
AdSense-only publisher it is free with no volume cap, certified without you
having to track certification, and requires no third-party script — which is
worth something specific here, since §3 already establishes that every
additional ad-adjacent origin is a line in the CSP and a phase-3 problem.

Two honest costs. It ties consent to the ad network, so moving to a managed
partner later means changing CMP as well — mitigated by the fact that
Mediavine and Raptive supply their own CMP anyway, so that migration is coming
regardless. And consent state lives in Google's tooling rather than somewhere
the application can read directly.

**That second cost is the one with an architectural answer.** Read consent
through the Consent Mode v2 signals on `dataLayer` — `ad_storage`,
`analytics_storage`, `ad_user_data`, `ad_personalization` — rather than
through any one CMP's API. Every certified CMP emits them, so the application
depends on the signal and not on the vendor, and swapping CMP becomes a console
change instead of a code change. That is the same seam argument as §5, applied
one layer down: the thing worth abstracting is the signal, not the provider.

It also settles the GA4 gap in §2. Once `Analytics` reads the same signals, one
banner governs both tags and there is no second source of truth — which was the
actual requirement, and is the part no CMP gives you for free.
