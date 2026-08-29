# Content-Security-Policy

## Why this exists

Two components render article bodies with `dangerouslySetInnerHTML`:

- `app/(frontend)/components/article.tsx`
- `app/(frontend)/[slug]/page.tsx`

What they inject is `toBodyHtml(doc)` — the Lexical body converted to HTML, or
the preserved Ghost markup in `legacyHTML` when there is no rich text. React's
escaping is deliberately switched off on that path, because it is the only way
to render a migrated body. Whatever that field holds is handed to the browser
as live markup.

Ghost bodies routinely contain provider embed cards — YouTube and Vimeo
players, social cards, newsletter widgets — which are `<script>` and `<iframe>`
elements. They arrived from the export unreviewed and unsanitized, and they are
supposed to keep working after cutover.

A Content-Security-Policy is an HTTP response header listing which sources the
browser may load and execute from. It does not stop bad markup from reaching
the page. It decides what the browser is willing to act on once it is there.

Write access to `legacyHTML` is already restricted to editors and admins (see
`collections/Posts.ts`). That narrows _who_ can introduce markup. The policy
narrows _what the markup can do_ — for a compromised editor account, a hostile
embed inherited from Ghost, or a future bug that reintroduces untrusted HTML on
that path.

## What ships today

`CSP_MODE` unset behaves as **report-only**. The browser evaluates the policy,
reports what it would have blocked, and blocks nothing. Deploying it cannot
break the site; that is the whole point of the first phase.

| Piece                      | Location                                                               |
| -------------------------- | ---------------------------------------------------------------------- |
| Policy construction        | `lib/security/csp.ts`                                                  |
| Header wiring              | `next.config.ts` → `headers()`                                         |
| Violation endpoint         | `app/csp-report/route.ts`                                              |
| Report parsing and logging | `lib/observability/csp-report.ts`                                      |
| Unit tests                 | `tests/security/csp.test.ts`, `tests/observability/csp-report.test.ts` |
| End-to-end assertions      | `e2e/csp.spec.ts`                                                      |

The generated policy, with media and analytics configured:

```text
default-src 'self';
script-src 'self' 'unsafe-inline' https://www.googletagmanager.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: <S3_PUBLIC_URL origin> <analytics>;
font-src 'self' data:;
connect-src 'self' <S3_PUBLIC_URL origin> <analytics>;
media-src 'self' <S3_PUBLIC_URL origin>;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'self';
frame-src 'self' <CSP_FRAME_SRC>;
worker-src 'self' blob:;
manifest-src 'self';
upgrade-insecure-requests;
report-uri /csp-report;
report-to csp-endpoint
```

### Why the policy is in `next.config.ts` and not `middleware.ts`

`middleware.ts`'s matcher deliberately excludes `/admin`, `/api`, `/webhooks`,
`/redirects-map`, the generated SEO files, and anything containing a dot. Those
exclusions exist for documented reasons — the `webhooks` one prevents Stripe
retries from being met with a staging 401 — and the Payload admin is exactly
the surface that must not be left uncovered.

Headers declared in `next.config.ts` apply to every route, including those.
The trade-off is that a config header is static, so it cannot carry a
per-request nonce. That is the single reason `'unsafe-inline'` is still in
`script-src`, and phase 3 below is about removing it.

`e2e/csp.spec.ts` asserts the header is present on both a public page and
`/admin`, so a future move to middleware cannot silently drop admin coverage.

## Directive rationale

| Directive                   | Value                                    | Why                                                                                                                        |
| --------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `default-src`               | `'self'`                                 | Everything not named below falls back to same-origin.                                                                      |
| `script-src`                | `'self' 'unsafe-inline'` + analytics     | See the limitation below. Blocks scripts from arbitrary third-party origins.                                               |
| `style-src`                 | `'self' 'unsafe-inline'`                 | Payload's admin bundle and Next's critical CSS both emit inline style.                                                     |
| `img-src`                   | `'self' data: blob:` + media + analytics | `data:` for inlined icons, `blob:` for admin upload previews before the file reaches R2.                                   |
| `connect-src`               | `'self'` + media + analytics             | GA4 posts to `region1.google-analytics.com` as well as the main collector.                                                 |
| `object-src`                | `'none'`                                 | Nothing uses `<object>`/`<embed>`; both are classic ways to execute script past a `script-src`.                            |
| `base-uri`                  | `'self'`                                 | Stops injected markup rewriting the base URL and re-pointing every relative script on the page.                            |
| `form-action`               | `'self'`                                 | Stops injected markup posting the newsletter form — or a convincing fake login — to another server.                        |
| `frame-ancestors`           | `'self'`                                 | **Not `'none'`.** Live Preview renders the public site inside an admin iframe on the same origin; `'none'` breaks preview. |
| `frame-src`                 | `'self'` + `CSP_FRAME_SRC`               | Provider embeds inside migrated bodies. Empty until the inventory below is done.                                           |
| `upgrade-insecure-requests` | —                                        | Production only; development is served over plain HTTP.                                                                    |

Development additionally gets `'unsafe-eval'` in `script-src` and `ws:` in
`connect-src`, which React Refresh and the HMR socket require. Both are absent
from production builds, and a test asserts that.

## What this phase does _not_ protect against

**`script-src` still contains `'unsafe-inline'`, so injected inline script
still runs.** An attacker who can write `<script>…</script>` into `legacyHTML`
is not stopped by the policy as it stands.

This is not an oversight, and it is worth being precise about why:

- Next.js App Router streams the RSC payload through inline `<script>` tags on
  every page.
- `app/(frontend)/components/analytics.tsx` renders an inline GA4 init block.
- Payload's admin bundle emits its own inline script.

None of those carry a nonce today, so removing `'unsafe-inline'` would white-
screen the entire application, admin included. `tests/security/csp.test.ts`
asserts the value is present, so removing it is a deliberate, test-breaking
decision rather than something that happens by accident.

What the current policy _does_ buy, even with that gap:

- a `<script src="https://evil.example/x.js">` in a body is blocked
- `<object>` and `<embed>` payloads are blocked outright
- `<base href="https://evil.example/">` cannot re-point relative URLs
- forms cannot be redirected to an off-site collector
- the site cannot be framed by another origin (clickjacking)
- iframes are limited to an explicit provider allowlist

That is a real reduction in blast radius. It is not stored-XSS protection, and
this document should not be read as claiming otherwise.

## Rollout

### Phase 1 — observe (this is where the repository is now)

Deploy with `CSP_MODE` unset. Nothing is blocked. Then:

1. Exercise the surfaces the automated suite does not: log into `/admin`, edit
   a post, open Live Preview at all three breakpoints, upload an image, run a
   search, submit the newsletter form, and open several **migrated** articles
   with embeds.
2. Read the violations:
   ```bash
   docker compose logs app | grep csp_violation
   ```
   Each is one JSON line beside the existing `not_found` and `webhook_rejected`
   lines:
   ```json
   {
     "level": "warn",
     "event": "csp_violation",
     "time": "…",
     "directive": "frame-src",
     "blockedURI": "https://www.youtube.com/embed/abc",
     "documentURI": "…",
     "sourceFile": null,
     "disposition": "report"
   }
   ```
3. Let it run across real traffic long enough to cover the long tail of
   migrated posts — a week is a reasonable minimum, and it should span at least
   one full editorial workflow.

**Gate:** the only remaining violations are ones you have consciously decided
to accept or to allowlist.

### Phase 2 — enforce

Set `CSP_MODE=enforce`. The same policy, now blocking.

Do this only after phase 1 is quiet, and expect to keep `CSP_MODE=off` in mind
as an incident escape hatch — it is there so that a bad policy is a one-variable
rollback rather than a redeploy.

**Gate:** no new `csp_violation` lines with `"disposition":"enforce"` for a full
day of normal traffic, and the manual checklist from phase 1 passes again.

### Phase 3 — remove `'unsafe-inline'` from `script-src`

This is the phase that actually closes the stored-XSS path, and it is the
expensive one. The standard approach is a per-request nonce with
`'strict-dynamic'`:

```text
script-src 'nonce-<random>' 'strict-dynamic';
```

Every legitimate inline script carries `nonce="<random>"`; injected markup
cannot guess it. The obstacles here, in order of difficulty:

1. **A nonce must be generated per request**, which a static `next.config.ts`
   header cannot do. It has to move to `middleware.ts`, which means widening
   the matcher — carefully, because its current exclusions are load-bearing.
2. **The Payload admin is not our code.** Its bundle emits inline script we do
   not control and cannot nonce. The realistic outcome is a split: a strict
   nonce policy for the public site, a looser one for `/admin`, justified by
   the admin being authenticated and staff-only.
3. **GA4's inline init block** needs the nonce threading through
   `app/(frontend)/components/analytics.tsx`, or replacing with a file-based
   script.

A reasonable intermediate step, if phase 3 stalls: keep `'unsafe-inline'` but
add a hash for the known-good GA4 block, which at least documents the inline
script the application intends.

## Inventory the embeds before enforcing

`frame-src` is `'self'` only until `CSP_FRAME_SRC` is filled in. Enforcing that
against real content would silently blank every provider embed inside migrated
articles.

The report-only phase is how the list gets built — every blocked provider shows
up as a `frame-src` violation with the provider's URL in `blockedURI`. Fill
`CSP_FRAME_SRC` from the reports, not from guesswork about what Ghost contained.

This overlaps the Phase 0 inventory item in
[`docs/INSERTABLE_CONTENT_MODULES.md`](INSERTABLE_CONTENT_MODULES.md) — "inventory
Ghost cards/custom HTML and count actual module patterns." The CSP reports are
a cheap, mechanical way to produce part of that inventory, and the `embed` block
described there should draw its provider allowlist from the same list.

## The report endpoint

`POST /csp-report` is unauthenticated by necessity: browsers send reports with
no credentials, from any visitor, on their own schedule. It is therefore written
as untrusted ingest.

- **Bounded.** Bodies over 16 KB are dropped, checked against both the declared
  `content-length` and the bytes actually received.
- **Not persisted.** One row per violation would put an attacker in charge of
  database growth. The same reasoning already governs `module-events` in the
  insertable-modules plan.
- **Silent.** Always `204` with no body, so a caller learns nothing about what
  was recorded. `GET` returns `405`.
- **Privacy-reduced.** `sanitizeUri` strips query strings before logging,
  because on this site a query string can carry a reader's search term
  (`/search/?q=…`). `data:` and `blob:` URLs are reduced to their scheme so a
  payload cannot be smuggled into the log.
- **Excluded from `middleware.ts`.** Same trap as `webhooks`: with
  `STAGING_BASIC_AUTH` set, the gate would answer every browser report with a
  401 — and staging is exactly where the policy gets tuned.

`csp-report` is registered in `RESERVED_ROOT_SLUGS`, so a migrated page can
never take that slug silently.

To send reports to an external collector instead, set `CSP_REPORT_URI`. The
policy emits both `report-uri` (deprecated, but the only channel Firefox
implements) and `report-to` with a matching `Reporting-Endpoints` header.

## Configuration

| Variable          | Default       | Meaning                                                                      |
| ----------------- | ------------- | ---------------------------------------------------------------------------- |
| `CSP_MODE`        | `report-only` | `report-only`, `enforce`, or `off`. Unset never enforces and never disables. |
| `CSP_FRAME_SRC`   | empty         | Space- or comma-separated origins allowed in `frame-src`.                    |
| `CSP_SCRIPT_SRC`  | empty         | Same format; additional `script-src` origins.                                |
| `CSP_CONNECT_SRC` | empty         | Same format; additional `connect-src` origins.                               |
| `CSP_IMG_SRC`     | empty         | Same format; additional `img-src` origins.                                   |
| `CSP_REPORT_URI`  | `/csp-report` | External collector, if not the built-in endpoint.                            |

`S3_PUBLIC_URL`, `NEXT_PUBLIC_GTM_ID` and `NEXT_PUBLIC_GA_ID` are read from the
existing configuration — the policy derives the media origin the same way
`next.config.ts` derives `images.remotePatterns`, and admits the analytics
origins only when a tag is actually configured.

The analytics allowance keys on **configuration**, not on the `noindex` gate
that decides whether a tag renders. The policy is built in middleware and must
permit whatever the page may load: permitting an origin the page then does not
use costs nothing, while withholding one it does use breaks the tag under
enforcement.

### The three script/connect/img variables exist for Tag Manager

A container fires third-party tags chosen in a web interface long after this
policy was written, each loading from an origin no built-in list could predict.
Without a way to extend the policy, adopting a container means either a policy
that blocks half of it or no policy at all.

Fill them the same way as `CSP_FRAME_SRC` — from the report-only findings, which
name the exact origin each blocked request wanted, rather than from guesswork.
Two container problems these variables do **not** solve: a custom HTML tag may
need `'unsafe-eval'`, which is granted only in development, and Tag Manager's
Preview mode opens a debug connection the policy may block. Both are reasons to
keep report-only while building out a container. See
[`ANALYTICS.md`](ANALYTICS.md).

## Rollback

- **Policy too strict in production:** set `CSP_MODE=report-only` and restart.
  One variable, no redeploy of code.
- **Something pathological:** `CSP_MODE=off` removes the headers entirely.
- **Revert the change:** no schema, no data, no migration. The endpoint writes
  nothing and the header is additive.

## Open questions

1. Whether `/admin` should get its own looser policy now or only at phase 3.
   Splitting early costs a second `headers()` entry and buys a tighter public
   policy sooner.
2. Whether violation reports should go to an external collector rather than the
   application log once enforcing — logs are fine for a tuning window, less fine
   as a permanent security signal nobody is paged on.
3. Whether `upgrade-insecure-requests` is still needed once every migrated media
   reference has been rewritten off the Ghost domain. It is cheap insurance
   until the media rewrite is verified complete.
