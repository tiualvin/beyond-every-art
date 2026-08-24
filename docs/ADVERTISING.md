# Advertising

An evaluation of putting ad units on the site: what is in the way, what the
architecture should be so that AdSense is not a one-way door, and in what order
the work should happen. Nothing here is built except the `public/ads.txt` fix
described in §1, which was a bug found while writing this.

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
3. `/ads.txt` returned 404 in production. Fixed here, and worth understanding
   because the failure mode is instructive.

The order that follows from this is: fix ads.txt (done), build consent, cut
over, apply, then wire the ad layer behind a flag. §7 lays it out.

The more important point is in §6: **the ceiling on RPM is traffic, not
architecture.** Futureproofing the code is cheap and worth doing, but it is not
what stands between this site and a better RPM, and it would be a mistake to
spend a lot of engineering on a header-bidding stack that a managed partner
would later replace wholesale.

## 1. `/ads.txt` was never served

`ads.txt` was committed at the repository root. Next.js serves static files
from `public` and nowhere else, so the root was already the wrong place — and
the production image made it worse in a way that would not reproduce locally.

`next.config.ts` sets `output: 'standalone'`, which traces the server's imports
and copies those. It deliberately does not copy `public`, on the assumption
that a CDN serves it. Nothing does here: the Caddyfile has no `file_server` and
no `root`, it reverse proxies every path to the app container. The `Dockerfile`
copied `.next/standalone` and `.next/static` and stopped.

So the file existed, contained the right publisher ID, was tracked in git, and
answered 404 on the live domain. `next dev` would have served it if it had been
in `public`, which is the kind of gap that survives review: everyone checks
that the ID is correct and nobody checks that the URL resolves.

This matters more than a missing file usually would. An `ads.txt` that 404s is
not a degraded `ads.txt` — buyers treat an unreadable file as an absent one,
which makes the inventory unauthorised. The file exists precisely to prevent
that, so a broken one inverts its own purpose.

The fix is three things, and all three have to hold together:

- the file lives at `public/ads.txt`;
- the `Dockerfile` runner stage copies `public` into the image;
- [`../tests/seo/ads-txt.test.ts`](../tests/seo/ads-txt.test.ts) fails if
  either of those stops being true, and also checks record formatting and the
  trailing newline (it was committed without one, and some parsers drop an
  unterminated final record — which, in a one-record file, is all of them).

Verify after the next deploy by fetching `https://<domain>/ads.txt` and reading
the body, not the status code. Note that `trailingSlash: true` does not apply
to files in `public`; they are served at the exact path.

## 2. Consent is the real blocker

There is no cookie consent system in this repository. Grepping for one finds
the OAuth consent screen and the newsletter signup's consent line, and nothing
else.

Google has required a certified consent management platform for AdSense,
Ad Manager and AdMob traffic from the EEA, UK and Switzerland since January 2024. Without one, ads to those users are not served — this is enforced by
Google, not merely advised. Google's own Privacy & messaging GDPR message is
certified and free, which makes it the pragmatic first choice; the cost of
picking it is that consent state then lives in Google's tooling rather than
somewhere the application can read.

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
2. **Consent management.** The largest piece of real work, and a prerequisite
   for ads rather than a part of them. Retrofit GA4 behind the same consent
   state while doing it.
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
