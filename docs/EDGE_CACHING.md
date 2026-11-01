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
