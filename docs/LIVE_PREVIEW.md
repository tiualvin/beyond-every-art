# Payload Live Preview

## What this is

Editors open a post or page in Payload Admin and switch to the **Live Preview**
tab. The real frontend renders in an iframe beside the editor, at mobile,
tablet, or desktop widths, and re-renders as they work — no leaving the editor,
no losing their place.

This is built and verified. The older click-through preview still exists
alongside it: the "Preview" button opens the draft in a new tab, with the draft
banner and its exit link.

## How it is wired

| Piece                                              | File                                                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Preview URL builder (shared, pure)                 | [`lib/preview/live-preview.ts`](../lib/preview/live-preview.ts)                                                   |
| Admin config: breakpoints, collections, iframe URL | [`payload.config.ts`](../payload.config.ts)                                                                       |
| "Preview" button URLs, drafts autosave             | [`collections/Posts.ts`](../collections/Posts.ts), [`collections/Pages.ts`](../collections/Pages.ts)              |
| Authorization, draft mode, redirect                | [`app/(payload)/api/preview/route.ts`](<../app/(payload)/api/preview/route.ts>)                                   |
| Draft/live request mode                            | [`lib/preview/mode.ts`](../lib/preview/mode.ts)                                                                   |
| Refresh-on-save listener                           | [`app/(frontend)/components/live-preview-listener.tsx`](<../app/(frontend)/components/live-preview-listener.tsx>) |

The flow: the admin points the iframe at `/api/preview?collection=…&slug=…&live=1`,
that route authorizes the request and turns on Next.js draft mode, and the
browser lands on the document's real URL, which renders the latest draft. On
every save the admin posts a message to the iframe and the listener calls
`router.refresh()`, so the preview is the same server render a reader would get
— relationships resolved, images sized — not a client-side approximation.

## Decisions taken

**Server-rendered refresh, not client-side streaming.** Payload also offers
`useLivePreview`, which streams the in-memory document to the page on every
keystroke. It would have meant rebuilding the article as a client component fed
by a second, isomorphic version of the mapping in `lib/content/queries.ts`, and
its document arrives with relationships unpopulated — no authors, tags, or
media. `RefreshRouteOnSave` keeps one rendering path at the cost of roughly one
autosave interval of latency.

**Autosave at 800ms, capped at 50 versions per document.** Autosave is what
makes the preview live; without it the iframe only moves when someone remembers
to press a button. The cap is the counterweight: a version per typing pause
would otherwise grow `_posts_v` and `_pages_v` without bound, and those tables
land in every backup the schedule takes.

Two consequences worth knowing before editors are trained on this. Editing an
already-published document now produces a draft that must be republished, and
starting a new document creates it in the collection as soon as anything is
typed — abandoned drafts stay behind rather than evaporating.

**Session authorization instead of a secret in the URL.** The admin and the site
are one Next.js application on one origin, so the browser sends the Payload
session cookie with both the iframe request and the Preview button. The route
authorizes against that and requires an `admin`, `editor`, or `author` role.
`PAYLOAD_PREVIEW_SECRET` still works as a fallback for links built outside the
admin, but nothing generates URLs containing it any more — it no longer leaks
into browser history, referrers, or a screenshot of the edit view.

**The redirect target is rebuilt, never echoed.** `/api/preview` composes the
destination from the collection and slug through `previewTargetPath`, so no
query parameter can turn it into an open redirect.

## Constraints to preserve

- **Same origin.** No CSP or `X-Frame-Options` header is set in
  [`next.config.ts`](../next.config.ts) or the [`Caddyfile`](../Caddyfile), and
  the draft-mode cookie is `SameSite=Lax`, so the iframe works with nothing
  extra. Any future security-header work must keep `frame-ancestors 'self'`.
  Moving the admin to its own hostname would break both the cookie and the
  postMessage origin check, and would need `SameSite=None; Secure`.
- **`NEXT_PUBLIC_SITE_URL` must be the origin the admin is served from.** It is
  the iframe's origin and the only origin whose save messages the listener
  trusts.
- The listener is mounted only when a live-preview session is active, so no
  live-preview JavaScript reaches public readers.

## Verified

Against a real Payload and PostgreSQL instance, with a seeded admin and an
unpublished post:

- Live preview renders the draft, hides the draft banner, and loads the
  listener; the plain Preview button renders the draft, shows the banner, and
  does not load the listener.
- An unauthenticated `/api/preview` request is refused with 401, an unknown
  collection with 400, and an anonymous reader still gets a 404 on the draft's
  public URL.
- An autosaved edit is what the preview renders on the next refresh.
- Exiting preview clears both the draft-mode and live-preview cookies.
- The admin's live-preview view returns the iframe URL with `live=1` and no
  secret anywhere in its HTML.

Unit tests cover the URL builder, including the `null` that hides the button for
a document with no slug yet, and the collection allowlist.

## Not built

- Live preview for globals (`Header`, `Footer`, `SiteSettings`) and for
  `Media`, `Authors`, `Tags`, `Redirects`.
- Client-side `useLivePreview` and the isomorphic mapper it would need.
- A Playwright spec driving the admin's live-preview tab. The behaviour above
  was verified by request against a live instance, not through the browser.
- Preview of publication-system surfaces, which are gated behind cutover by
  [`PUBLICATION_SYSTEM.md`](PUBLICATION_SYSTEM.md).
- Member-gated rendering, so `members` and `paid` posts preview as staff see
  them rather than as a subscriber would.

## Open

- Draft mode is still a bare cookie, and the draft queries in
  `lib/content/queries.ts` use `overrideAccess: true`. `/api/preview` now gates
  who can _obtain_ that cookie, but anyone holding one can read every draft.
  Checking the session at render time as well would close it.
- Whether autosave's abandoned-draft behaviour needs a periodic cleanup once
  real editors are working in the CMS.
- [`AGENTS.md`](../AGENTS.md) puts a safe migration first, and this is editor
  tooling rather than migration fidelity. It is inert for readers, but it is not
  cutover work.
