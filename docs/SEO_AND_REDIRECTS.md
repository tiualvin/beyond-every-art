# SEO and Redirects

This document describes the Phase 1 SEO parity layer: the pieces that preserve
the Ghost site's discoverability, feed, and inbound links after migration. It
complements the migration handoff in
[`GHOST_TO_PAYLOAD_HANDOFF_WITH_APP_STRATEGY.md`](GHOST_TO_PAYLOAD_HANDOFF_WITH_APP_STRATEGY.md).

## What is provided

| Concern       | Route            | Source                       |
| ------------- | ---------------- | ---------------------------- |
| XML sitemap   | `/sitemap.xml`   | `app/sitemap.ts`             |
| Robots rules  | `/robots.txt`    | `app/robots.ts`              |
| RSS feed      | `/rss`           | `app/rss/route.ts`           |
| Redirects     | (all paths)      | `middleware.ts`              |
| Redirect data | `/redirects-map` | `app/redirects-map/route.ts` |

The pure, framework-free logic lives under `lib/seo/` and is unit tested:

- `lib/seo/site.ts` — site origin resolution and Ghost-parity path builders.
- `lib/seo/redirects.ts` — path normalization and redirect-map matching.
- `lib/seo/rss.ts` — RSS 2.0 rendering with XML escaping.
- `lib/seo/sitemap.ts` — sitemap entry construction.

## Redirects

Redirects are managed as data in the `redirects` collection (source,
destination, status code, enabled). Because Next.js middleware runs on the edge
runtime and cannot reach Postgres directly, the flow is:

1. `middleware.ts` fetches the enabled rules from `/redirects-map` and caches
   them in memory for 60 seconds.
2. Each request path is normalized (trailing slash, duplicate slashes, and
   percent-encoding are canonicalized; query strings are ignored) and matched
   against the rule map.
3. A match issues a redirect with the rule's status code (301/302/307/308);
   otherwise the request falls through. Any lookup failure fails open so a
   redirect outage can never take the site down.

Editing redirects in the CMS takes effect within the cache window without a
redeploy.

### Which origin, and why it is not the obvious one

Both halves of that flow need an origin, and `request.nextUrl.origin` — the one
Next hands the middleware — is the wrong answer for both. Next composes it from
the server's bind address and the forwarded scheme, so in the container, where
the Dockerfile sets `HOSTNAME=0.0.0.0` and Caddy sends
`X-Forwarded-Proto: https`, it reads `https://0.0.0.0:3000`. That produced two
failures at once, neither of which looked like a failure:

- the fetch in step 1 opened a TLS connection to a listener that speaks plain
  HTTP, so the map never loaded and **every migrated Ghost URL answered 404**;
- had it loaded, step 3 resolved each on-site destination against the same
  origin, so the `Location` header pointed readers and crawlers at
  `https://0.0.0.0:3000/...`.

So the two origins are now named separately, in `lib/security/origins.ts`:

- `internalOrigin()` — `http://127.0.0.1:$PORT`, for the fetch. It must not
  leave the container, and it must not claim a scheme the app does not serve.
- `forwardedOrigin()` — rebuilt from `X-Forwarded-Host` / `Host` and
  `X-Forwarded-Proto`, for the `Location` header, so a reader is redirected on
  the hostname they actually used. Staying relative instead is not available:
  Next's edge adapter parses the `Location` header as a URL and rejects a
  relative one.

`e2e/privacy-and-redirects.spec.ts` forwards a host that is deliberately not the
one the server is bound to. That is the assertion the old test could not make —
under Playwright the bind address is the address the test dialled, so a redirect
built the wrong way still pointed somewhere that worked.

## URL structure

### The host

The site is served from **`www.beyondeveryart.com`**. Ghost answers on both
names and canonicalises to the `www` one, so that is the host on every indexed
URL and every inbound link, and the host this deployment has to keep answering.
`SITE_ADDRESS` is that name — Caddy provisions its certificate from it, and a
certificate for the wrong name means every existing link fails its TLS handshake
rather than merely redirecting. `SITE_REDIRECT_FROM` is the bare domain, which
Caddy answers with a 301 to the canonical host so only one host serves pages.

`NEXT_PUBLIC_SITE_URL` must carry the same host, because every URL the site
publishes about itself — canonical tags, the sitemap, the feed — is built from
it. Naming the wrong host there tells search engines the whole site moved.

### The trailing slash

Ghost served every permalink with a trailing slash, so `next.config.ts` sets
`trailingSlash: true` and the path builders emit the same shape (`/post/`,
`/about/`, `/tag/x/`, `/author/x/`). Migrated URLs are then served directly
rather than through a redirect, which is the whole point: the URLs search
engines already hold keep working exactly as they are.

It applies to every route, not only pages, so anything calling a route handler
has to use the slash too. The ones that exist today:

| Caller                                                                       | Address             |
| ---------------------------------------------------------------------------- | ------------------- |
| Container healthcheck and the deploy's readiness probe                       | `/health/`          |
| Stripe webhook endpoint, as registered in the Stripe dashboard               | `/webhooks/stripe/` |
| CSP violation reports (`lib/security/csp.ts`)                                | `/csp-report/`      |
| Middleware's read of the redirect table                                      | `/redirects-map/`   |
| Search suggestions, fetched from the browser                                 | `/search/suggest/`  |
| Feed, as advertised in `<link rel="alternate">` and the feed's own self link | `/rss/`             |

A browser posting a CSP report and Stripe delivering a webhook both treat a
redirect as a failure rather than following it, so those two are not cosmetic.

Redirect matching is trailing-slash insensitive, so stored rules and inbound
links resolve whether or not they include a trailing slash.

## Build behavior

`/sitemap.xml`, `/rss`, and `/redirects-map` are `force-dynamic`: they query
Payload at request time and never touch the database during `next build`, and
they degrade to a valid minimal response if the database is briefly
unavailable. `/robots.txt` is static.

## Pending

~~The public content routes are not built yet.~~ They shipped with the
post-migration frontend: `app/(frontend)/[slug]` serves posts and pages,
`app/(frontend)/tag/[slug]` and `app/(frontend)/author/[slug]` serve the
archives, and `app/sitemap.ts` already includes tag and author URLs alongside
posts, pages, and apps.

~~One item from that plan is genuinely still open. Nothing configures trailing
slashes.~~ Settled: `trailingSlash: true`, matching Ghost, described under "URL
structure" above. It was worth settling before the cutover rather than after —
changing it once search engines have recrawled means a second round of redirects
on every URL the site has.
