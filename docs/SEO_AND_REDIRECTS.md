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

Path builders emit the Ghost permalink structure with trailing slashes
(`/post/`, `/about/`, `/tag/x/`, `/author/x/`) so canonical, sitemap, and feed
URLs preserve the pre-migration URLs and their SEO value. Redirect matching is
trailing-slash insensitive, so stored rules and inbound links resolve whether or
not they include a trailing slash.

## Build behavior

`/sitemap.xml`, `/rss`, and `/redirects-map` are `force-dynamic`: they query
Payload at request time and never touch the database during `next build`, and
they degrade to a valid minimal response if the database is briefly
unavailable. `/robots.txt` is static.

## Pending

The public content routes (post, page, tag, and author pages) are not built yet;
they arrive with the post-migration frontend. When they land they should be
served with trailing slashes to match the URLs advertised here, and the sitemap
can be extended with tag and author URLs.
