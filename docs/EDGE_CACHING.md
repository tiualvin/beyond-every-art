# Edge Caching

What Cloudflare caches for this site, what it does not, and the two changes
that would let it hold more: resized images, which is half built, and pages,
which is a plan waiting on the owner's decisions.

Related: [`EDGE_PROTECTION.md`](EDGE_PROTECTION.md) (how Cloudflare came to sit
in front of every hostname), [`CONTENT_SECURITY_POLICY.md`](CONTENT_SECURITY_POLICY.md),
[`ACCOUNT_MODEL.md`](ACCOUNT_MODEL.md).

## Where it stood on 31 Oct 2026

Measured from outside on 31 Oct 2026, through Cloudflare's IAD colo.

| Response                          | Cloudflare | Browser may reuse              | Time to first byte  |
| --------------------------------- | ---------- | ------------------------------ | ------------------- |
| `/_next/static/*` (JS, CSS, font) | `HIT`      | a year                         | 0.20–0.37s          |
| `/api/media/file/*` (originals)   | `MISS`     | 4 hours (Cloudflare's default) | 0.78s (first fetch) |
| `/_next/image/*` (resized)        | `DYNAMIC`  | **60 seconds**                 | 0.79–0.83s          |
| Every page                        | `DYNAMIC`  | never (`no-store`)             | 0.37–1.1s           |

The test environment's own proxy adds roughly 0.2s to every row, so the
absolute numbers are pessimistic. The gaps between rows are what is real:
whatever Cloudflare holds arrives about half a second sooner than whatever it
has to fetch.

The two `DYNAMIC` rows are the ones on the critical path of a page view: the
document, and the resized image the reader sees first. Neither is cached at
the edge, for different reasons.

## Resized images

### Built: a week of lifetime

`images.minimumCacheTTL` was unset, and Next 15's default of 60 seconds came
out as `Cache-Control: public, max-age=60, must-revalidate`. It is now seven
days (`IMAGE_CACHE_TTL_SECONDS` in [`lib/security/images.ts`](../lib/security/images.ts)),
verified on a production build:

| Request `Accept`      | Served       | `Cache-Control`                           |
| --------------------- | ------------ | ----------------------------------------- |
| Chrome / Firefox      | `image/webp` | `public, max-age=604800, must-revalidate` |
| Safari                | `image/webp` | `public, max-age=604800, must-revalidate` |
| `*/*` (some crawlers) | `image/jpeg` | `public, max-age=604800, must-revalidate` |

A week is safe because an image URL on this site never starts serving
different bytes. That has three halves, each checked in Payload's source or
this repository rather than assumed:

- **Uploads never reuse a name.** Payload's `getSafeFileName` loops until no
  document holds the filename, so a replaced file arrives as `photo-1.jpg`
  under a new URL.
- **The three paths that do overwrite a name write the same bytes.**
  `pnpm backfill:media` and `pnpm restore:media` re-upload the original they
  read, and publication page images are named by a hash of their bytes.
  `tests/security/images.test.ts` fails if a fourth appears.
- **No image is private.** `media.read` is `publicRead`, so nothing the
  optimizer produces is anything a stranger could not already fetch.

What a week costs is deletion. An image removed from the library stops being
served by the optimizer at the next deploy, because `.next/cache` is not a
volume. Cloudflare's copy can be purged by URL (below). A browser that already
loaded it keeps it for up to the week.

This alone helps the reader who comes back. It does nothing for a first visit,
because Cloudflare still caches nothing under `/_next/image/`: the path has no
file extension, and extension is how Cloudflare decides by default.

### Dashboard step: the cache rule

Not applied. It is a Cloudflare setting, so it is the owner's to make. The
Cloudflare token Caddy holds is scoped to DNS and is the wrong credential for
this, and no credential should pass through an agent session anyway.

**Caching → Cache Rules → Create rule**

- **Rule name:** Resized images
- **When incoming requests match** (Edit expression):

  ```
  (http.host eq "www.beyondeveryart.com"
   and starts_with(http.request.uri.path, "/_next/image/")
   and any(http.request.headers["accept"][*] contains "image/webp"))
  ```

- **Then:** Eligible for cache
- **Edge TTL:** Use cache-control header if present, bypass cache if not. That
  is the week above, so the number lives in one place.
- **Status code TTL:** 400–599 → No store. The optimizer answers 400 for a
  bad parameter, and `middleware.ts` answers 429 when its rate limit trips. A
  cached 429 would block every reader at that colo.
- **Browser TTL:** Respect origin.
- **Cache key:** leave the default, which includes the query string. `url`,
  `w` and `q` are the image.

**Why the `Accept` clause is not optional.** Next chooses the format per
request and says so with `Vary: Accept`. Cloudflare ignores `Vary: Accept`,
and adding `Accept` to the cache key is an Enterprise feature. So one URL holds
one variant for everyone, and without the clause the first request decides
which: a crawler sending `*/*` would get the JPEG cached and served to every
browser in that colo for a week. With the clause, only requests that will
receive WebP are cached. Every current browser's image request includes
`image/webp`, and anything else goes to the origin as it does today.

That reasoning holds only while WebP is the only modern format the optimizer
emits. `tests/security/images.test.ts` fails if `formats` is set, which is the
step that would turn AVIF on. Change this rule first.

If the dashboard refuses the `http.request.headers` field on this plan, do not
apply the rule without that clause. The lifetime above still works in browsers.

Also turn on **Caching → Tiered Cache → Smart Tiered Cache**. On a site with
this much traffic, a resized image is rarely requested twice at one colo
within its lifetime. With tiering, colos ask a nearer upper tier before they
ask the VPS.

**To verify** (run each twice):

```bash
U='https://www.beyondeveryart.com/_next/image/?url=%2Fapi%2Fmedia%2Ffile%2F<file>&w=828&q=75'
curl -sI -H 'Accept: image/avif,image/webp,*/*' "$U" | grep -iE 'cf-cache-status|content-type|age'
# second run: HIT, image/webp, an Age header
curl -sI -H 'Accept: */*' "$U" | grep -iE 'cf-cache-status|content-type'
# always DYNAMIC, image/jpeg — never served from the WebP copy
```

**To purge one deleted image:** the optimizer accepts one quality and sixteen
widths (640, 750, 828, 1080, 1200, 1920, 2048, 3840 and 16, 32, 48, 64, 96,
128, 256, 384), so an image's edge copies are exactly sixteen URLs. Purge by
URL takes them on every plan. The one-quality rule exists for other reasons,
in `lib/security/images.ts`, but this is a second thing it buys.

## Pages

**Not built.** Everything below is a plan, and it waits on the decisions at
the end. Pages are what a crawler caches and what a reader lands on, so this
is the owner's call rather than an agent's.

### Why it is the remaining lever

After #231, measured on the live site with a throttled phone profile (slow 4G,
4× CPU), median of five:

| Page     | Time to first byte | First paint | LCP   |
| -------- | ------------------ | ----------- | ----- |
| Homepage | 0.70s              | 1.42s       | 1.72s |
| Post     | 0.72s              | 1.44s       | 1.84s |

Both are inside the 2.5s threshold now, and time to first byte is the largest
single part of what is left. All of it is the VPS rendering a page that is the
same for every reader. From the vantage measured here, a response
Cloudflare already held arrived in 0.20–0.37s, and a page took 0.37–1.1s. How
much of that gap a reader gets back depends on the hit rate, which is the
first thing Phase 1 would measure. A reader near a colo and far from the VPS
gains the most.

### Why it is safer here than it sounds

Edge-caching HTML usually fails by serving one person's page to another. On
this site today there is no other person to serve:

- **No reader can sign in.** Only `users` (staff) has `auth`. Reader accounts
  are Phase 2 in [`ACCOUNT_MODEL.md`](ACCOUNT_MODEL.md), and nothing of them is
  built.
- **Members-only posts are already the same for everyone.** In
  `lib/content/queries.ts`, `restricted = visibility !== 'public' && !preview`,
  so every visitor gets the teaser, and only an editor in preview gets more.
- **Anonymous responses set no cookies.** Checked on the homepage, a post, a
  404 and the journal: no `Set-Cookie`, which Cloudflare would otherwise refuse
  to cache.
- **The security policy is static.** The CSP is a config header with no
  per-request nonce, so a cached copy carries the same policy the origin would
  send.

### What must never be cached

These are the parts of the application whose answer depends on who is asking,
and each would be wrong, or harmful, served from a shared copy.

| What                                                                                                 | Why                                                                                                                                                                                                                                                                                                                    | How it is kept out                                  |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Any 404**                                                                                          | `requireLookupableSlug` in `lib/security/slug-requests.ts` answers 404 for _every_ slug, real articles included, once a source has used up its allowance of misses. Cached, one bot guessing URLs would make a live article 404 for Googlebot and every reader at that colo. **This is the hazard that matters most.** | Status code TTL: 400–599 → No store                 |
| `/search/`                                                                                           | A throttled search renders a normal 200 page saying so (`app/(frontend)/search/page.tsx`). Cached, everyone searching that term would see the throttle.                                                                                                                                                                | Not marked cacheable; outside the rule              |
| Editor sessions and preview                                                                          | `getPreviewMode` (`lib/preview/mode.ts`) renders drafts for a request carrying the draft-mode cookie and an editorial session.                                                                                                                                                                                         | Cookie bypass, and the CMS host is outside the rule |
| RSC requests                                                                                         | Client-side navigation fetches the same path with an `RSC` header and an `_rsc` query. Cloudflare ignores the `Vary` header that tells them apart. These are not LCP requests anyway.                                                                                                                                  | Not marked cacheable                                |
| `/health/`, `/api`, `/admin`, `/oauth`, `/webhooks`, `/csp-report`, `/redirects-map`, `/.well-known` | Monitors, staff tooling, signed callbacks: nothing to gain and several ways to be wrong.                                                                                                                                                                                                                               | Not marked cacheable; outside the rule              |

The cookies are `payload-token` (Payload's session; `cookiePrefix` is the
default), `__prerender_bypass` (Next's draft mode) and `bea-live-preview`
(`lib/preview/live-preview.ts`).

### Design: the origin decides, Cloudflare obeys

Two independent halves, each of which is safe on its own:

1. **The origin marks what may be cached.** A response header
   `Cloudflare-CDN-Cache-Control: max-age=600`, sent only on frontend page
   routes, only when none of the three cookies is present, and never on the
   paths above. It would be built the way `lib/performance/client-hints.ts`
   was: a pure helper that `next.config.ts` applies through `headers()` (whose
   `missing` conditions test cookies, headers and query keys), and a test that
   runs against the real exported config. Cloudflare reads this header and does
   not forward it, so browsers keep receiving today's
   `private, no-cache, no-store`. A reader's own browser never holds a page,
   and a published edit is never stuck in it.
2. **Cloudflare caches only what is marked.** One cache rule on the `www`
   hostname: Eligible for cache; Edge TTL "Use cache-control header if
   present, bypass cache if not"; Status code TTL 400–599 → No store; Browser
   TTL: Respect origin. It also has an expression clause that bypasses on any
   of the three cookies, which repeats the origin's check at the edge.

If the header is missing, nothing is cached, because the remaining
`Cache-Control` says `no-store`. If the rule is missing, nothing is cached,
because HTML is not eligible by default. Turning either off is an immediate
rollback.

`Cloudflare-CDN-Cache-Control` also accepts `stale-if-error`. With
`stale-if-error=86400`, Cloudflare serves the last good copy for a day when the
VPS errors or is down mid-deploy, instead of an error page. It is listed as a
decision below.

### Phase 1: ten minutes, no purge, no secret

`max-age=600` is not arbitrary. It is `CONTENT_TTL_SECONDS` in
`lib/cache/ttl.ts`, the staleness the database-read cache already accepts, and
the helper would import it so the two cannot drift apart. What readers would
see:

- **An edit or a new post:** visible to signed-out readers within 10 minutes.
  At the origin it is immediate, because `revalidateContent` purges the read
  cache on publish. The edge copy waits out its 10 minutes.
- **A scheduled post:** up to 20 minutes after its time. No event fires when
  the time passes, so it is 10 minutes at the origin and then 10 at the edge.
- **A redirect edit:** 10 minutes, plus the redirect map's own 60-second
  refresh.
- **A bad deploy:** after rolling back, purge everything, or broken pages stay
  at the edge for up to 10 minutes.

With Smart Tiered Cache on (see the image rule), colos ask an upper tier before
the VPS, which matters at this site's traffic: a long-tail article is seldom
read twice at one colo within 10 minutes.

### Phase 2: longer, with purge on publish

Every content and redirect change already reaches one function,
`revalidateContent` in `lib/cache/content.ts`, through the collections'
`purgeOnChange` and `purgeOnDelete` hooks. Phase 2 adds a call there to
Cloudflare's purge API. That would purge everything rather than a list of URLs,
for the same reason the read cache's tags are coarse: a post appears on the
homepage, the journal, its tags, its authors, the feed and the sitemap, and the
first listing forgotten is the one that stays stale. Purge-everything is
available on every plan, and the cache refills on demand.

That needs a Cloudflare API token limited to Zone → Cache Purge on this zone,
plus the zone id, in the production environment file. It should be a new
token, not the DNS token Caddy holds. The owner creates and places it, and it
never passes through an agent session.

With purge, the edge TTL can rise. Scheduled posts set the remaining bound,
because they still fire no event. An hour means a scheduled post is at most an
hour late.

### Decisions for the owner

1. **Phase 1 as described:** signed-out readers may see a page up to 10
   minutes old after an edit, and a scheduled post up to 20 minutes late.
   Acceptable?
2. **`stale-if-error`:** serve the last good copy for up to a day when the VPS
   is failing, rather than an error page. Recommended; it is availability for
   free.
3. **Phase 2, later:** a purge-only Cloudflare token in production, in exchange
   for a longer TTL. Worth deciding after Phase 1 has run for a week and its
   hit rate is known.

And two constraints on future work. Neither is a decision now, but both are
easy to miss:

- **Per-request CSP nonces cannot coexist with cached HTML.**
  [`CONTENT_SECURITY_POLICY.md`](CONTENT_SECURITY_POLICY.md) names nonces as the
  standard route to dropping `'unsafe-inline'`. A cached page would hand the
  same nonce to every reader, which is no nonce at all. Hashing the inline
  scripts is the route compatible with this plan.
- **Reader sign-in makes pages personal.** When Phase 2 of the account model
  ships, its session cookie joins both bypass lists, the origin's and the
  rule's, in the same change that ships sign-in, not after it.

### Verifying it, once enabled

```bash
P=https://www.beyondeveryart.com/<a-post>/
curl -sI "$P" | grep -iE 'cf-cache-status|age|cache-control'     # MISS, then HIT with an Age
# the browser-facing Cache-Control is still private, no-cache, no-store
curl -sI -H 'Cookie: payload-token=x' "$P" | grep -i cf-cache       # never HIT
curl -sI -H 'RSC: 1' "$P?_rsc=x" | grep -i cf-cache                  # never HIT
curl -sI 'https://www.beyondeveryart.com/search/?q=pigment' | grep -i cf-cache   # never HIT
curl -sI https://www.beyondeveryart.com/no-such-piece/ | grep -i cf-cache        # never HIT, any number of times
```

Then the one that matters most. From one address, request made-up slugs until
the slug-miss allowance runs out and a real article answers 404 there. Then
request that same article from a different network: it must answer 200, and
never `HIT` on a 404. Last, re-run the LCP measurement from the table above and
compare.
