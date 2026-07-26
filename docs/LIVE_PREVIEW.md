# Payload Live Preview — scope

## Status and intent

This document scopes adding **Payload Live Preview** to the backend. Nothing
here is built yet; it is a plan, not a runbook.

The repository already has _click-through draft preview_: the admin "Preview"
button opens `/api/preview`, which checks a shared secret, enables Next.js draft
mode, and redirects to the document's public URL
(`app/(payload)/api/preview/route.ts`, wired from `admin.preview` in
[`collections/Posts.ts`](../collections/Posts.ts) and
[`collections/Pages.ts`](../collections/Pages.ts)). That satisfies the handoff's
"draft preview works" acceptance item.

Live Preview is a different feature: an iframe of the real frontend rendered
**inside** the edit view, with device breakpoints, updating as the document
changes without the editor leaving the editor.

## The prerequisite that decides everything

`getPostBySlug` / `getPageBySlug` build `bodyHtml` from the **`legacyHTML`**
field, and `Article` renders that string
([`lib/content/queries.ts`](../lib/content/queries.ts),
[`app/(frontend)/components/article.tsx`](<../app/(frontend)/components/article.tsx>)).
The Lexical `content` field is stored but never rendered.

So live preview shipped against today's frontend would reflect changes to
title, excerpt, featured image, tags, authors, meta fields, and the raw
`legacyHTML` code field — and **nothing an editor types into the rich-text
editor**. That is the opposite of what the feature is for.

Two honest options:

1. **Render `content` first** (recommended). Add the Lexical → React renderer
   (`RichText` from `@payloadcms/richtext-lexical/react`), with `legacyHTML` as
   the fallback for migrated posts that have no converted rich text yet. This is
   independent, useful work — the migration's rich-text conversion is otherwise
   unverifiable — and it is what makes live preview worth building.
2. **Ship live preview against `legacyHTML` only**, and document the limitation.
   Defensible only if editors are expected to keep working in `legacyHTML`
   through cutover.

Everything below assumes option 1 is sequenced first, but the backend work in
Phase 1 is valid either way.

## Mechanism: which live-preview mode

Payload offers two frontend integrations. The choice constrains the backend
config, so decide it before writing any of it.

|                   | `RefreshRouteOnSave` (server-rendered)                               | `useLivePreview` (client-rendered)                                        |
| ----------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| How               | Admin posts a message on save; the frontend calls `router.refresh()` | Admin posts the whole in-memory document; the frontend re-renders from it |
| Latency           | One autosave interval (~1s)                                          | Instant, per keystroke                                                    |
| Requires autosave | Yes                                                                  | No                                                                        |
| Rendering         | Current server components stay as they are                           | Article rendering must become a client component fed by a shared mapper   |
| Relationships     | Resolved by Payload as today (`depth: 1` — authors, tags, media)     | Arrives unpopulated; needs client-side resolution or graceful degradation |
| Fit here          | Direct                                                               | Requires reworking `queries.ts` DTO mapping into an isomorphic mapper     |

**Recommendation: `RefreshRouteOnSave` + drafts autosave.** The article surface
depends on relationship-resolved data (`authors`, `tags`, `featuredImage`) and
on `next/image` sizing; a client-side document stream gives none of that
without a second data path. A ~1s refresh is an acceptable trade for keeping one
rendering path.

Consequence to accept explicitly: enabling autosave changes editing semantics.
Every keystroke pause writes a draft version, and editing an already-published
document produces a draft that must be republished. It also grows `_posts_v` /
`_pages_v` continuously, so `versions.maxPerDoc` must be set at the same time —
untrimmed version tables inflate every `pg_dump` the backup schedule takes.

## Phase 1 — backend (the requested scope)

### 1. `lib/preview/live-preview.ts` (new, pure, unit-tested)

Single source of truth for preview URLs, used by `admin.preview` _and_
`admin.livePreview` so the two cannot drift.

- `buildPreviewPath({ collection, slug })` → `postPath` / `pagePath` from
  [`lib/seo/site.ts`](../lib/seo/site.ts).
- `buildPreviewUrl({ collection, data, live })` → absolute URL onto
  `/api/preview`, via `getSiteUrl()`.
- Returns `null` when the document has no slug (new/unsaved). Payload hides the
  live-preview tab on `null`, which avoids an iframe pointed at `/undefined/`.
- Carries `live=1` for the live-preview variant so the frontend can suppress the
  draft banner and exit link inside the iframe.

### 2. `payload.config.ts` — `admin.livePreview`

Root-level rather than per-collection, so breakpoints are defined once:

- `collections: ['posts', 'pages']`
- `url: ({ data, collectionConfig }) => buildPreviewUrl(...)`
- `breakpoints`: mobile 375×667, tablet 768×1024, desktop 1440×900 — matching
  the widths [`docs/WEBSITE_VISUAL_DIRECTION.md`](WEBSITE_VISUAL_DIRECTION.md)
  and the Playwright projects already use.

Globals (`Header`, `Footer`, `SiteSettings`) are **out of scope** for v1.

### 3. `app/(payload)/api/preview/route.ts` — authorization and path safety

The route is currently secret-only. Live preview loads it in an iframe on every
document open, so it needs two changes:

- **Authorize by Payload session first.** The admin and the site are the same
  Next application on one origin, so the iframe request carries the Payload
  session cookie. Verify it with `payload.auth({ headers })` and require an
  `admin`/`editor`/`author` role; fall back to the shared secret for the
  existing manual Preview button. Two wins: the secret stops being pasted into
  URLs, browser history, and referrers, and preview keeps working when
  `PAYLOAD_PREVIEW_SECRET` is unset.
- **Validate the redirect target.** If the route starts accepting an explicit
  `path`, it must be rebuilt from `collection` + `slug` through the helper
  above, never echoed from the query string. Do not add an open redirect to the
  admin's attack surface.

Related, and worth fixing while the file is open: draft mode today is a bare
cookie, and the draft queries use `overrideAccess: true`. Anyone holding that
cookie can read every draft — including `visibility: members` and `paid` posts
that Phase 1 deliberately keeps staff-only. Session-gating the route is the
cheap half of the fix; the thorough half is checking the session again at render
time rather than trusting the cookie alone.

### 4. Collections — autosave

In `Posts.ts` and `Pages.ts`:
`versions: { drafts: { autosave: { interval: 800 } }, maxPerDoc: 50 }`.

Needs `pnpm generate:types` and a schema check against Postgres before it lands.

### 5. Frame and cookie constraints (verify, mostly no code)

- **Same origin.** Admin at `/admin`, frontend at `/`, one Next app — the
  draft-mode cookie's default `SameSite=Lax` is sent in the iframe, and no CSP
  or `X-Frame-Options` header is set anywhere in
  [`next.config.ts`](../next.config.ts) or the [`Caddyfile`](../Caddyfile). Live
  preview works with nothing extra. This is a standing invariant, not a
  coincidence: any future security-header work must keep `frame-ancestors
'self'`, and splitting the admin onto its own hostname would require
  `SameSite=None; Secure` cookies and a CSP allowance.
- **`NEXT_PUBLIC_SITE_URL` must match the origin the admin is served from**, or
  the iframe is cross-origin and the draft cookie silently stops applying.
  Worth a line in `.env.example`.
- **`STAGING_BASIC_AUTH`**: the iframe inherits the browser's credentials for
  the same origin, so the staging gate does not break live preview. `middleware.ts`
  already excludes `/api` and `admin` from redirect matching.
- **Slug edits**: Payload recomputes `url` from the changed document and reloads
  the iframe, so renaming a slug mid-edit follows the document instead of 404ing
  on the old path — provided the URL builder is a pure function of `data`.

## Phase 2 — frontend (required for the feature to do anything)

- Add `@payloadcms/live-preview-react@3.86.0` (pin to the Payload version, as
  every other `@payloadcms/*` dependency is pinned).
- Mount `RefreshRouteOnSave` in `app/(frontend)/layout.tsx`, rendered only when
  `draftMode().isEnabled`, so no live-preview JavaScript reaches public readers.
- Suppress `DraftBanner` and the exit-preview link when `live=1` — inside the
  iframe they are chrome the editor did not ask for.
- `app/(frontend)/[slug]/page.tsx` is already `force-dynamic`, so each refresh
  re-queries. No caching work needed for the article route.

## Phase 3 — verification

- **Unit** (`tests/preview/live-preview.test.ts`): URL builder — post vs page
  paths, `null` on missing slug, absolute origin, `live` flag, and that no
  secret appears in the live-preview URL.
- **Unit**: the preview route's authorization branches — valid session, no
  session with valid secret, no session and no secret, unknown collection.
- **E2E** (`e2e/live-preview.spec.ts`): seed a draft post, log in as the seeded
  admin, open the edit view, switch to the Live Preview tab, assert the iframe
  renders the draft title, edit the title, assert the iframe updates after
  autosave. Reuses `e2e/seed.ts` and `e2e/fixtures.ts`.
- **Manual**: confirm in production-like Docker + Caddy that the draft cookie
  survives the reverse proxy over HTTPS.

## Effort and sequencing

| Step | Scope                                                                        | Size |
| ---- | ---------------------------------------------------------------------------- | ---- |
| 0    | Render Lexical `content` with `legacyHTML` fallback (prerequisite)           | M    |
| 1    | URL builder, `admin.livePreview`, preview-route auth + path safety, autosave | M    |
| 2    | `RefreshRouteOnSave`, banner suppression, dependency                         | S    |
| 3    | Unit + E2E coverage                                                          | S–M  |

Phase 1 can land alone: it is inert until Phase 2 mounts the listener, and it
improves the existing preview route's security on its own.

## Out of scope

- Live preview for globals, `Media`, `Authors`, `Tags`, `Redirects`.
- Client-side `useLivePreview` and the isomorphic document mapper it needs.
- Preview of publication-system surfaces — those collections do not exist and
  are gated behind cutover by [`PUBLICATION_SYSTEM.md`](PUBLICATION_SYSTEM.md).
- Rebuilding member-gated rendering so `members`/`paid` posts preview as a
  subscriber sees them.

## Open decisions

1. Prerequisite Lexical rendering first, or live preview against `legacyHTML`?
2. Autosave interval and `maxPerDoc`, given backup size and the version-table
   growth it causes.
3. Keep `PAYLOAD_PREVIEW_SECRET` as a fallback, or move preview entirely onto
   the Payload session and retire the variable?
4. Does this belong before cutover at all? It is editor tooling, not migration
   fidelity — [`AGENTS.md`](../AGENTS.md) puts a safe migration first.
