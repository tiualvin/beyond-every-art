# Advertising

An evaluation of putting ad units on the site: what is in the way, what the
architecture should be so that AdSense is not a one-way door, where the units
go, and in what order the work should happen.

Five pieces of it are now built: `/ads.txt` (§1), the AdSense loader itself
(`app/(frontend)/layout.tsx`, whenever the deployment is indexable), the slot
layer (`lib/ads/placements.ts`, `lib/ads/eligibility.ts` and `lib/ads/inline.ts`,
per §5), and two units — `rail-1`, the 300×250 in the post rail, and
`article-inline`, repeated down the body by length. Both render through
`app/(frontend)/components/ad-unit.tsx`.

**Consent is no longer the blocker.** Google's Privacy & messaging — the
certified CMP §9 recommends — is configured in the AdSense console, reported by
the repository owner on 19 Sep. It needs no code here: the AdSense tag loads the
European regulations message itself, which is exactly why it was recommended.

The other half of §2 is closed too, and that half was code.
`lib/analytics/consent.ts` declares the Consent Mode v2 defaults before either
Google tag acts on them: granted where no banner is shown, denied across the
EEA, the UK and Switzerland where one is. Both tags honour it, so one banner
now governs both — which is what §2 asked for and what §9's seam argument is
built on. [`ANALYTICS.md`](ANALYTICS.md) has the placement, which took
measuring.

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
2. There is a consent management platform now. Google's Privacy & messaging is
   configured in the AdSense console (19 Sep, owner-reported), which is what
   Google requires before it will serve ads to EEA/UK traffic at all. What is
   still missing is the application's half: GA4 runs ungated, and nothing here
   reads a Consent Mode signal. §2.
3. `/ads.txt` is now served by Caddy from the repository-root file (§1).
   Closed on 29 Aug, with one operator action left: delete the dead redirect
   row in Payload, which can never run and which `validate:redirects` reports.

Only the first is still a blocker. The order that follows is: cut over, apply,
then wire the units already built. `ads.txt` and the CMP are no longer part of
that sequence. §7 lays it out, §8 plans the placements, and §9 evaluates the
consent platforms and records which one was chosen.

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

**Settled on 29 Aug: Caddy serves the file.** A `handle /ads.txt` block in the
public site block, evaluated before the catch-all `reverse_proxy`, serving the
repository-root file bind-mounted read-only at `/srv/ads.txt`.

This was found by running `pnpm validate:redirects` against staging rather than
by reading code on cutover day. It reported both halves as errors — the
middleware matcher skipping the path, and the path answering 404 — which is
what that tool exists for.

Three reasons this beats the two options previously written here:

- **One copy.** The committed file is the file served. `public/ads.txt` would
  have been a second source of truth for a third party's records, and
  `output: 'standalone'` skips `public`, so it would have worked under
  `next dev` and 404'd in production — correct exactly where nobody checks.
- **No target to host.** A `redir` needs somewhere to redirect _to_, which for
  a self-hosted file means hosting it twice over.
- **Clear of `trailingSlash`.** Answering before the proxy means the question
  of whether `/ads.txt` reaches Next as `/ads.txt` or `/ads.txt/` never arises.

Verified against a real Caddy binary before shipping: `GET /ads.txt` returns
200 with `Content-Type: text/plain; charset=utf-8` and the file's body, with no
redirect to the slashed form, while other paths still reach the app.

**One operator action remains.** The `/ads.txt` row in the `Redirects`
collection is dead configuration — the middleware can never run it — and it is
what `validate:redirects` still reports. Delete it in Payload admin. Caddy
answers the path now, so the row protects nothing and only produces a
recurring error in a tool whose value depends on a clean run meaning something.

The redirect becomes the better answer again the day a managed partner hosts
the file — see the end of §6. At that point replace the `handle` block with a
`redir`, and delete the mount.

[`../tests/seo/ads-txt.test.ts`](../tests/seo/ads-txt.test.ts) pins it: the
file is at the root and not in `public`, the Caddyfile serves it at exactly
`/ads.txt`, `docker-compose.yml` mounts it read-only, its records parse, and it
ends with a newline (it was originally committed without one, and some parsers
drop an unterminated final record — which, in a one-record file, is all of
them). The serving path spans two files and either alone is a 404, which no
build or app-level test would catch.

Verify after cutover by fetching `https://<domain>/ads.txt` and reading the
body, not the status code.

## 2. Consent was the real blocker — it is closed

**Settled 19 Sep, in a console rather than in this repository.** Google's
Privacy & messaging is configured on the AdSense account, per the owner. That
is the certified CMP §9 recommends, it is certified by construction because
Google both requires and supplies it, and the AdSense tag serves the European
regulations message on its own — which is why "zero integration work" was the
argument for it and why nothing in this repository changed when it was turned
on.

That closes the requirement below. Google has required a certified consent
management platform for AdSense, Ad Manager and AdMob traffic from the EEA, UK
and Switzerland since January 2024, and the framework version has since moved —
TCF v2.3 became mandatory on 1 March 2026. Without a CMP certified at the
current version, ads to those users are not served, and this is enforced by
Google rather than merely advised. §9 evaluates the options, including why the
open-source ones cannot be used here.

**What the console did not close, and what did.** There is still no cookie
consent _banner_ in this repository — grepping finds the OAuth consent screen
and the newsletter signup's consent line, and nothing else. That is correct:
the ad tag brings its own. What was missing was the other side of it.

**GA4 had this problem, and the CMP made it sharper rather than softer.**
`app/(frontend)/components/analytics.tsx` loads the GA4 tag whenever
`NEXT_PUBLIC_GA_ID` is set and the deployment is indexable, and for a while
there was nothing in front of it. That was a small gap while there was no
banner at all; the moment one went live it became a claim the analytics tag was
not honouring, on every EEA and UK visit — and a site whose banner governs half
its tags is in a worse position than one running none, because it has made a
promise.

**Closed the way §9's last paragraph asks**, by declaring Consent Mode v2
defaults rather than by gating the script. That distinction is the part worth
keeping: a Google tag with no declared default treats consent as _granted_, so
the fix is not "do not load GA4" — it is to say what it may store before it
asks. Denied across the EEA, the UK and Switzerland; granted elsewhere, because
Google's CMP shows no banner there and a global denial would never be updated
for anybody else. `lib/analytics/consent.ts`, and
[`ANALYTICS.md`](ANALYTICS.md) for where the script has to sit and why that
took measuring rather than reading.

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

**Corrected on 19 Sep.** This section used to end by recommending that ad
origins be gated on the ad provider being configured, mirroring what
`ANALYTICS_SCRIPT_ORIGINS` and friends then did. Do not do that. Those origins
are no longer gated either, because the gate was a live bug: the policy is built
by `next.config.ts` during `pnpm build`, where no `NEXT_PUBLIC_*` value exists,
while the tag is rendered per request from the live value. Production reported
`script-src-elem` violations for `gtm.js` on every page within minutes of the
cutover, and `CSP_MODE=enforce` would have ended analytics collection silently.

So `AD_SCRIPT_ORIGINS`, `AD_FRAME_ORIGINS`, `AD_IMG_ORIGINS` and
`AD_CONNECT_ORIGINS` in `lib/security/csp.ts` are permitted unconditionally, and
a test pins that the policy does not vary on `NEXT_PUBLIC_ADSENSE_CLIENT`. The
principle the gate violated is the one this file already argued: an origin the
page does not use costs nothing, while one withheld that it does use breaks the
tag. It costs nothing in practice for a second reason too — `'unsafe-inline'` is
still in `script-src`, so a host allowlist entry adds nothing to the reach of
anyone who can already inject markup.

The list that ships is a starting set, not a complete one. Google does not
publish these origins as a stable contract and creatives reach further than the
loader does, which is exactly why §7 turns ads on while the policy is still
report-only: the reports name the origin of every request the list gets wrong.

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

**Built, as the second.** `splitHtmlForAds` in
[`../lib/ads/inline.ts`](../lib/ads/inline.ts) scans top-level tags with a
depth counter rather than a parser — void elements, comments, self-closing tags
and a stray `<` all have to behave, and a regex that counted `<p` would not —
and its failure mode is to return the body as one chunk, so a shape it cannot
read gets no ads rather than mangled markup. It is lossless by construction and
by test: the chunks rejoin to the original byte for byte, verified on three
real migrated bodies. The Lexical branch splits the node list on the same plan,
so both branches take their breaks from one function.

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
| `placements`  | Placement names as a public contract — the ID column of §8's inventory, which is what a component asks for by name.                                                        |
| `eligibility` | One predicate: should this request see ads.                                                                                                                                |

The placement names are the part that does the futureproofing, and they work
the same way `BLOCK_SLUGS` in `blocks/schema.ts` does: a name for what the
slot _is_, never for what fills it. `article-mid` maps to an AdSense slot ID
today and to some other partner's unit later, and no component that renders an
ad ever knows which. That mapping is the only thing a provider swap touches.

`eligibility` earns its own module because it is where unrelated conditions
meet, and each of them is a bug if it is checked in only some of the places a
unit appears:

- the deployment is indexable (`isNoindex()` — no ads on staging, same reason
  analytics does not run there);
- the post is not a restricted teaser;
- later, the reader is not a paying member.

**Consent is deliberately not on that list**, which is a correction to an
earlier version of this section. With Google's CMP (§9) the tag enforces
consent itself, and a reader who refuses gets limited ads rather than none — so
withholding the `<ins>` here would not be honouring a consent decision, it
would be throwing away the inventory Google is still willing to serve. The
consent work that is outstanding is GA4's (§2), and it belongs in front of the
analytics tag rather than in this predicate.

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
generation machinery for a file that will eventually be a redirect.

It also argues for one of §1's two options over the other. The site already
serves `/ads.txt` by redirect on Ghost, and a managed partner would want a
redirect again — so carrying the redirect across the cutover keeps the shape
the file has had all along, and a one-line committed record is right for
AdSense in the meantime.

## 7. Sequence

1. **Settle `/ads.txt`,** at cutover and not before — the Ghost redirect serves
   it until then. §1 has the two options and the trap in each.
2. **Consent management.** Done in the console on 19 Sep: Google's Privacy &
   messaging, per §9's recommendation, serving the European regulations message
   through the AdSense tag. The banner half needed no code and got none. The
   remaining half is this repository's — reading Consent Mode v2 signals and
   retrofitting GA4 behind them — and it is still outstanding, which §2 says
   plainly rather than leaving this step looking finished.
3. **Cut over.** [`DEPLOYMENT_STATUS.md`](DEPLOYMENT_STATUS.md)'s "Flip" —
   unset `NEXT_PUBLIC_NOINDEX` and `STAGING_BASIC_AUTH`. Nothing about
   advertising can be evaluated before this, including the AdSense
   application itself.
4. **Let traffic establish, then apply to AdSense.** Applying against a site
   with no organic traffic history and a fresh domain configuration invites a
   decline that is slow to appeal.
5. **Build `lib/ads/`.** Three of §5's four modules exist. `lib/ads/adsense.ts`
   resolves the publisher and `app/(frontend)/components/adsense.tsx` renders
   Google's loader, gated on the deployment being indexable so staging never
   serves ad code. It ships _on_ rather than off — the publisher defaults to the
   id committed in `ads.txt`, since a loader nobody switched on is
   indistinguishable from the problem it was meant to fix — with
   `NEXT_PUBLIC_ADSENSE_CLIENT=off` as the switch for pulling it without a
   deploy. `lib/ads/placements.ts` holds the placement names and the sizes they
   reserve; `lib/ads/eligibility.ts` is the one predicate, and it already
   answers for the restricted teaser as well as the deployment. `providers` is
   not built: there is one provider, and an interface with one implementation
   is a guess about the second. The seam that matters — that no component knows
   which network fills a slot — is held by the placement names on their own.
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

**The reading column is 704px, and there is one track beside it.** This
paragraph once said 704 for the wrong reason — `.article__inner` is
`max-width: 44rem` with `.container`'s `1.5rem` padding coming out of it under
`border-box`, so the column was 656px, not 704 — and the post template has
since been rebuilt around two tracks, which is what
[`POST_PAGE_LAYOUT.md`](POST_PAGE_LAYOUT.md) records and
[`../tests/design/article-layout.test.ts`](../tests/design/article-layout.test.ts)
pins. The widths a unit can be sized against are now:

| Track                | ≥1280 |
| -------------------- | ----- |
| Text column          | 704   |
| Rail                 | 300   |
| Full block, less pad | 1052  |

Two tracks and one width, at every desktop size. A notes margin between them
was tried and removed: most articles had nothing to hang in it, and an empty
column reads worse than white space.

An in-column unit is sized for the measure — 336×280, 300×250, or a responsive
unit capped at 704 — because a leaderboard does not fit in a reading column at
any width. What the rail adds is a 300px column, and an end-of-article unit
placed across the whole block has room for 970×250. The 72rem container on
listing pages is unchanged at 1104px usable.

**The featured image is the LCP element.** `FeaturedFigure` renders with
`priority`, which is Next telling the browser this is the largest contentful
paint. Anything placed above it competes with it for the network and pushes it
down the page. So there is no header unit and no unit above the featured image
in this plan, at any breakpoint. That is the single most valuable inventory
slot on most sites and it is deliberately left empty here; taking it would cost
LCP on every article, which is the page type the whole site exists to serve.

The split hero sharpens this rather than softening it. Title and image now sit
side by side from 1280 up, so the hero spans both tracks and the rail begins
level with the body — which is exactly where the first rail slot goes, below
the hero and clear of the element the browser is painting for LCP. A unit
beside the image rather than above it still competes for the same network, so
that slot's request is deferred to idle.

### Inventory

| ID                         | Track / template     | Position                                          | Desktop | Mobile  | Reserved |
| -------------------------- | -------------------- | ------------------------------------------------- | ------- | ------- | -------- |
| `rail-1` **built**         | Rail, `/[slug]`      | Above the newsletter card, inside the sticky pair | 300×250 | —       | 250px    |
| `article-inline` **built** | Text, `/[slug]`      | Repeated down the body, by length — see below     | fluid   | fluid   | 280px    |
| `article-end`              | Block, `/[slug]`     | Below the author card, above Read Next            | 970×250 | 300×250 | 250px    |
| `archive-inline`           | journal, tag, author | After every 6th entry row                         | 970×250 | 300×250 | 250px    |
| `home-mid`                 | `/`                  | Between Featured and Topics                       | 970×250 | 300×250 | 250px    |

Five identified placements, of which **four should be live at launch**: all but
`home-mid`. Two are, and `rail-1`'s reservation held: turning it on was a fill
rather than a re-layout.

What it was _not_ was free of consequences for the rail around it, and the
outcome is worth recording because it cost an editorial module. 279.3px of the
sticky group is the unit, its cap and its gap, the group is capped at the
viewport less 100, and on a 1440×900 laptop that left "More on this" showing
one piece and part of a second where three were meant to be. A ladder fixed it
down to 683px of viewport; then the module was removed outright, because every
piece it listed already closes the article in "Read next" on every device
while the rail reached desktop only. The rail is now the unit and a newsletter
card with a picture, and the card is what gives on a short window —
`pnpm measure:rail`, and the table in
[`POST_PAGE_LAYOUT.md`](POST_PAGE_LAYOUT.md).

**The general lesson is worth keeping for the four units still to come.** A
unit's reserved height is not only a promise about layout shift; it is a claim
on whatever is elastic next to it. Decide what gives before placing the unit,
or the unit quietly eats the editorial content it was placed beside — which is
exactly what happened here, and it took two passes to notice that the right
answer was not a better ladder but a module that should not have been
competing with an ad for the same 250px.

**The rail carries one unit, not three.** An earlier version of this table had a
ladder of three, spaced a viewport apart down a rail that scrolled with the
page. The rail's modules are now a single sticky group — the slot, the related
pieces and the newsletter travel with the reader — and a sticky group has room
for exactly one. That is a real trade: three sequential impressions become one
with near-perfect viewability, and by the rule below it cannot be refreshed to
recover the other two. Whether long exposure on one unit beats three glances is
a per-slot measurement rather than something to settle here.

### The count follows the length

The row above used to read "after the 5th body block", one unit, fixed. That is
the right shape for a 900-word post and the wrong shape for this archive. The
14 published articles average **4,800 words** and the longest is **7,899**,
which at the measure is 27,000px of scrolling. One unit in thirty screens is
not a placement, it is a token — and the reader who stays for a 30-minute piece
is the one worth the most, which a fixed count cannot express.

So `lib/ads/inline.ts` plans the breaks from a running word count: **the first
unit at 400 words, one every 800 after it, at most six.** The numbers are
measured rather than picked.

- **400 words** is about a screen and a half, so the first unit is below the
  fold and never shares the opening screen with the hero and the rail unit.
- **800 words** is the two-units rule below, converted. Body copy at the 704px
  measure runs about 3.3px per word, so a 900px desktop screen holds ~270 words
  and an 844px phone screen ~128. 800 words is therefore ~3 desktop screens and
  ~6 phone screens, and desktop is the binding case.
- **Six** covers the mean article exactly and caps the outlier, which would
  otherwise take ten. The cap is the part that matters here, because most of
  this archive is long enough to reach it. The returns past six are thinner
  than the arithmetic suggests — most readers never get there, so unit six
  earns a fraction of unit one while costing the same in how the page reads.

What that yields, on the real corpus: 3 units on the shortest article, 6 on the
mean, 6 on the longest. Verified against three migrated bodies, where the
splitter is also lossless — the chunks rejoin to the original byte for byte.

The px-per-word figure is the one that can go stale, because it is a fact about
the type rather than about the writing.
[`../tests/design/article-layout.test.ts`](../tests/design/article-layout.test.ts)
recomputes the gap from `.prose`'s size and leading and fails if a type change
would put a third unit on a screen.

`article-inline-2` and `-3` are retired as _names_: there is one placement
inside the reading column, rendered as many times as the article is long,
rather than three hand-placed slots.

### Rules that go with it

**Two units can share a screen, and only two.** The sticky rail unit is in view
for most of the article by design, so `article-inline-1` passes it once. That
screen is the ceiling: 336×280 plus 300×250 is 13% of a 1440×900 screen,
against the 30% Coalition for Better Ads threshold Chrome enforces. There is no
third unit above the fold to add to it, which is what the single-unit rail buys
back.

An earlier version of this section reasoned rather than measured: it claimed one
unit visible per screen and spaced a three-unit rail at `140vh`, and the built
layout put three in one screen a third of the way down a 9-minute article. The
rail carrying one unit removes the question.

**An unfilled slot shows house content, not a blank.** Google declines
impressions routinely — no demand, no consent, a blocker in front of the tag —
and the reserved height is held either way, so without this a reader gets a
labelled empty box. `rail-1` therefore has a fallback, chosen in Payload under
Site Settings → "Article rail — when no ad is shown": up to three articles, one
of the apps, or nothing.

**Up to three, because filling 250px is the design problem.** The first version
took a single article and put its headline in the middle of the box, which left
most of the box as paper and read as a mistake rather than as a choice. Three
headlines with a rule between them fill it the way the related module used to;
one is given its own picture instead, at 2:1 rather than the newsletter card's
3:2 so two stacked frames do not read as a repeat, and its standfirst where it
has no picture. `pnpm measure:rail --unfilled --promo <1-3>` renders each.

Three things about it are load-bearing:

- **The label goes.** "Advertisement" over our own promotion is a claim that is
  not true, and not one to be making to an ad network. It is hidden with
  `visibility` rather than `display`, so the box does not change height as it
  goes.
- **The fallback is laid over the unit, not swapped into it.** Google's snippet
  puts `display: inline-block` in the `<ins>` element's own `style` attribute,
  which beats any stylesheet rule — so "hide the empty unit and show something
  else" silently hides nothing and stacks the two. It shipped that way for
  about ten minutes and made the sticky group 893px against an 800px cap, which
  scrolls the newsletter button out of reach. Absolutely positioned over the
  empty unit, the box is the same height either way.
- **Google's word always wins.** The slot guesses `unfilled` after three
  seconds of silence, because a blocked loader never sets `data-ad-status` at
  all and that is the commonest reason of all for an empty box. The guess is
  not latched: a tag that was merely slow can still answer, and the fallback
  gets out of the way when it does. A promo sitting over a served ad is a
  wasted impression and a policy problem.

The general point, for the four units still to come: a placement is not
finished when the unit renders. Decide what the space says when the network
says nothing, because that is what a large share of readers will actually see.

**A hidden slot does not ask for an ad.** `rail-1`'s track is `display: none`
below 1280px, and hiding a box does nothing whatever to the effect inside it —
so until this was guarded, every phone that opened an article requested an ad
for a unit no reader would ever see. That is most of the traffic, and it is
wrong three times over: the requests are wasted, the fill rate they come back
with is a number about nothing, and serving into a hidden container is not
something to do to an ad network on purpose.

CSS cannot fix it, because the push is JavaScript. So the breakpoint is a
property of the placement (`minViewportWidth` in
[`../lib/ads/placements.ts`](../lib/ads/placements.ts)), the unit asks
`matchMedia` before it asks Google, and it keeps listening so a window dragged
wider still fills. The design test checks that number against the stylesheet
that hides the track, because the failure mode of moving one without the other
is silent.

The general form, for the three units still to come: **a placement that any
breakpoint can hide needs its breakpoint written down where the request can
read it.** `archive-inline` and `home-mid` are in tracks that exist at every
width; if that stops being true for one of them, it needs an entry here.

**The sticky unit is not refreshed.** A unit that stays in view for a whole
article is the classic case for refresh, and refresh is the classic way to turn
a rail into a nuisance. One impression, high viewability, no reload.

**Never split a figure from its caption.** Insertion counts top-level block
children of the body and skips a position that would land between a `figure`
and text that reads as its continuation, or between a heading and the paragraph
beneath it. For migrated Ghost bodies this is a server-side HTML split (§4);
for Lexical bodies it is an index into the node list. Both need the same rule,
so it lives in [`../lib/ads/inline.ts`](../lib/ads/inline.ts) next to the
placement names rather than in either renderer.

Built, with one refinement the plan did not anticipate: **a refused boundary
defers the unit, it does not drop it.** Skipping the position outright loses
units on exactly the figure-heavy articles this archive is densest in, so the
unit waits for the next legal boundary and the count comes out right. The last
block never takes one either — a unit at the very end of the body is
`article-end` with extra steps.

**Reserve the maximum, always.** Each slot renders its reserved height before
anything fills it, from this repository's CSS, keyed on placement and
breakpoint. A 90px banner landing in a 250px reservation leaves whitespace;
that is the correct trade. Zero layout shift is the requirement, and an unfilled
slot must collapse to zero only on a subsequent navigation, never mid-view.

**One placement cannot honour that literally, and says so.** `article-inline`
is one of Google's in-article units, whose height comes from the creative — a
format with no maximum has nothing exact to reserve. Its 280px is a floor
chosen to cover the common case, not a promise, and `SlotSize` in
[`../lib/ads/placements.ts`](../lib/ads/placements.ts) is a discriminated union
(`fixed` | `fluid`) so the difference is in the type rather than in a comment
somebody stops reading. Measure the real creatives after launch: routinely
taller and the floor should rise, routinely shorter and it is costing
whitespace on every article. The alternative — a fixed 336×280 in the column —
was rejected because it forgoes the fluid format's native look and its mobile
fill, which is where most of the reading happens.

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

**Taken, on 19 Sep.** It is configured in the AdSense console. Nothing in this
repository records that, and nothing can: the whole point of this option is
that the tag carries the banner, so there is no import, no origin and no
setting here that would fail if it were switched off again. The one thing that
would notice is EEA and UK fill rate, which is where to look if ads stop
serving to those readers.

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

It also settles the GA4 gap in §2, and that is built rather than planned now —
`lib/analytics/consent.ts`. One banner governs both tags and there is no second
source of truth, which was the actual requirement and is the part no CMP gives
you for free.

One correction to the paragraph above, learned in the building. "Read consent
through the signals" is the wrong shape for a Google tag: there is nothing to
read, because the tag reads them itself. What the application owes is the
_declaration_ — the default state, before the tag looks. A reader is still the
right seam for anything non-Google, and there is nothing non-Google yet, so
there is no reader. The signal is the contract either way, which is the part
that mattered.

### What the banner can be made to look like

Choosing Google's CMP is choosing its markup, so it is worth being precise about
where the line falls before anyone designs against it.

Genuinely configurable, from the AdSense console under Privacy & messaging:
background, text and button colours as your own hex or RGB values; font family
and size, sized in `em` so it scales with the reader's own settings; bold,
italic, underline and alignment on the European regulations message; your logo;
button styling. Google checks button contrast and refuses combinations it reads
as unreadable. The paper ground, the burgundy, and a serif heading are all
reachable.

Not configurable: there is no custom HTML or CSS. The message renders inside
Google's own container from a fixed set of options, so a bespoke layout — our
own disclosure rows, our own reveal — is not reproducible.

Two things that look like workarounds and are not:

- **Do not restyle it from outside.** Certification covers the interface as
  rendered, including requirements like accept and reject carrying equal
  prominence. CSS that reaches into Google's container to change that produces
  a banner that breaks compliance while continuing to look compliant, which is
  strictly worse than an ugly one.
- **Do not build our own and feed Google the result.** The TC string has to be
  produced by a CMP that is registered with IAB Europe and certified against
  Google's validation. The Privacy & Messaging JavaScript API controls _when_
  the message appears and reports the resulting consent state; it does not
  accept a publisher-supplied interface.

One point left unverified deliberately. Bottom-pinned and centred-modal
placement are documented for ad blocking recovery messages; whether the same
choice is offered for the European regulations message was not confirmed, and
the console is the place to settle it rather than this file.

None of which wastes a design pass on the banner, because the banner was never
the expensive part. What placement, density, reserved slot heights, and the
behaviour on refusal look like is ours whatever renders the box — and per §8
that is the half that decides both revenue and Core Web Vitals.
