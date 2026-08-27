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
- `lib/seo/ghost-urls.ts` — the built-in rules for Ghost URL shapes this site
  does not serve.
- `lib/seo/middleware-coverage.ts` — which paths the matcher runs on, and so
  which rules can ever fire.
- `lib/seo/redirect-audit.ts` — judging a redirect against what a live site did.
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

### The rules that can never run

`middleware.ts` narrows itself with a matcher, and one clause in it decides
something the admin panel gives no hint of: **any path containing a dot is
skipped**, along with the prefixes the app and Payload own (`/admin`, `/api`,
`/oauth`, `/webhooks`, `/csp-report`, `/redirects-map`, `/rss`, `/sitemap.xml`,
`/robots.txt`). A redirect row for such a path imports cleanly, shows as
enabled, is returned by `/redirects-map`, and never fires — the request never
reaches the code that would answer it.

`/ads.txt` is the live instance ([`ADVERTISING.md`](ADVERTISING.md) §1). A Ghost
migration meets three more classes of it:

| Path                         | Why it matters                                   |
| ---------------------------- | ------------------------------------------------ |
| `/sitemap-posts.xml` and kin | Ghost's `/sitemap.xml` is an index of these four |
| `/content/images/…`          | every image hotlink and Google Images result     |
| `/ads.txt`                   | ad buyers, once display advertising is live      |

`lib/seo/middleware-coverage.ts` models the matcher so this is checkable rather
than remembered. `pnpm migrate:redirects` prints a warning naming any imported
rule that cannot run, and `pnpm validate:redirects` reports it as an error
against a live host. The fix is to serve the path from Caddy, not to adjust the
row.

Next requires `config.matcher` to be a statically analysable literal, so the
module cannot share the constant with the middleware; the copy is pinned to the
real one by `tests/seo/middleware-coverage.test.ts`.

### Pagination, which no export covers

Ghost paginates in the **path** (`/page/2/`, `/tag/x/page/2/`,
`/author/x/page/3/`); this site paginates in the **query string**
(`/journal/?page=2`). Ghost served those URLs itself, so its `redirects.json`
has nothing to say about them — and with 117 posts every one of them exists on
the live site today, is linked from its own archive pages, and is crawled.
Untreated they become 404s on cutover day.

`lib/seo/ghost-urls.ts` answers them, built in rather than as rows: they follow
from the two URL schemes rather than from anything an editor decided, and a
hand-maintained row per page number goes stale the next time a post is
published. A row for the same source still wins — the middleware consults the
table first — so any of them can be overridden from the admin panel.

Each collapses to the **unpaginated** archive, not to the equivalent `?page=N`:

| Ghost URL           | Destination  |
| ------------------- | ------------ |
| `/page/N/`          | `/journal/`  |
| `/tag/x/page/N/`    | `/tag/x/`    |
| `/author/x/page/N/` | `/author/x/` |

Two reasons, and the second is a bug rather than a preference. Ghost's page size
and this site's are different numbers, so "page 2" does not name the same posts
on both sides — there is nothing to preserve. And `/journal/` calls `notFound()`
for a page past the end of the archive, so mapping `/page/40/` to
`/journal/?page=40` would be a permanent redirect onto a 404: worse than the 404
it replaced, because a crawler then records the destination as the URL's new
home and stops asking for either.

### Validating them

`pnpm validate:redirects` checks every rule against a running site and exits
non-zero if any fails, so a cutover can be gated on it the way the import is
gated on `pnpm migrate:validate`:

```bash
pnpm validate:redirects --target https://staging.beyondeveryart.com \
  --input ghost-export/redirects.json \
  --basic-auth-env STAGING_CRAWL_BASIC_AUTH

pnpm validate:redirects --target https://www.beyondeveryart.com \
  --redirects-map https://cms.beyondeveryart.com/redirects-map/ \
  --tag materials --author livia-calderon
```

Rules come from a Ghost export (`--input`, which works before the import has
run) or from the live table (`--redirects-map`, which is what the middleware
actually reads — served only on the CMS hostname, since Caddy 404s it on the
public one). Give both and a rule present in the export but missing from the
table is reported too: an import that did not land, which checking the table
alone would never show.

For each rule it asserts four things, of which only the first is what a manual
spot-check covers:

- the source answers with the **configured status**;
- the `Location` points at the **stored destination**;
- that destination answers **200** — not another redirect, and not a 404;
- the source is one the **matcher actually runs on**.

It also warns on a redirect chain, which is usually a stored destination missing
its trailing slash that `trailingSlash: true` then fixes with a second round
trip for every reader and every crawl.

The built-in pagination rules are checked alongside the table. Pass `--tag` and
`--author` (repeatable) to expand the archive probes onto real slugs.

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
| OAuth client registration, authorization, token, and revocation              | `/oauth/…/`         |

A browser posting a CSP report and Stripe delivering a webhook both treat a
redirect as a failure rather than following it, so those two are not cosmetic.

The two RFC 8414 / RFC 9728 discovery documents are the one place a caller
cannot be asked to add the slash: the specifications fix those URLs exactly.
They are served at the address the specification names and redirect to their
slashed form, which every OAuth client follows — but it is why the resource
identifier in the metadata stays `/api/mcp`, unslashed, as the identifier the
specification says it is rather than a URL to fetch.

Payload's REST API under `/api/` is the exception: it answers at either shape.
Next routes it on path segments, which a trailing slash does not add to, but
the MCP transport compares `req.url` against the path it was mounted at — so
`app/(payload)/api/[...slug]/route.ts` takes the slash back off before Payload
sees the request. Without that, a tool call to `/api/mcp` was authenticated and
then answered `404 Not found`. `/api/mcp` therefore stays the endpoint every
document names, and the OAuth resource identifier it has to match.

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
