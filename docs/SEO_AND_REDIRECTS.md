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
