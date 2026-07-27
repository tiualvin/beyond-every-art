# Payload Live Preview

## What this is

Editors open a post or page in Payload Admin and press the **Live Preview**
toggle in the document toolbar. The real frontend renders in an iframe beside
the editor, at mobile, tablet, or desktop widths, and re-renders as they work —
no leaving the editor, no losing their place. Payload remembers the toggle per
user, so it stays open once an editor has turned it on.

There is no separate live-preview URL in this version of Payload; it is a state
of the edit view, not a sub-route. See
[`assets/live-preview/`](assets/live-preview/README.md) for what it looks like.

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
| Session check, used at both hops                   | [`lib/preview/session.ts`](../lib/preview/session.ts)                                                             |
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

**Session authorization and collection access.** The admin and the site are one
Next.js application on one origin, so the browser sends the Payload session
cookie with both the iframe request and the Preview button. `/api/preview`
requires an `admin`, `editor`, or `author` role before turning draft mode on,
and `getPreviewMode` requires it again on every render. The authenticated user
is then passed to Payload's Local API with `overrideAccess: false`, so the same
collection policy applies in the preview as in Admin: authors can preview only
posts they own and cannot preview page drafts.

The second check is the point. Draft mode is a bare cookie with no identity
attached, so on its own it is a durable key to every unpublished document —
including the `members` and `paid` posts that stay staff-only until subscriber
access is rebuilt. Copied from a shared browser, or simply kept after an account
is removed, it would keep working. Treating it as an intent to preview rather
than as permission means a request without a live editorial session falls back
to exactly what a reader sees, which for an unpublished document is a 404. The
check is memoized per request, and public traffic carries no draft cookie so it
never pays for it.

`PAYLOAD_PREVIEW_SECRET` is retired. A secret in the URL could only ever
authorize the first hop, which is the hop that was never the problem, and it
leaked into browser history, referrers, and screenshots of the edit view. There
is now no shared value to configure or rotate.

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
- A draft-mode cookie taken from a real preview session and replayed without
  the session behind it renders nothing privileged: 404 on the unpublished post
  and on a `paid` post, with no draft title, body, or listener in the HTML.
- A stale `PAYLOAD_PREVIEW_SECRET` in the environment no longer opens a preview
  session.
- An autosaved edit is what the preview renders on the next refresh.
- Exiting preview clears both the draft-mode and live-preview cookies.

Driven through Chromium against the same instance: logging into the admin,
opening a post, and pressing the Live Preview toggle renders the real site in
the iframe. Typing a new title, with no save button pressed, changed the
headline inside the iframe, and rewriting the excerpt changed the dek.

Unit tests cover the URL builder, including the `null` that hides the button for
a document with no slug yet, the collection allowlist, and the role gate.

## Not built

- Live preview for globals (`Header`, `Footer`, `SiteSettings`) and for
  `Media`, `Authors`, `Tags`, `Redirects`.
- Client-side `useLivePreview` and the isomorphic mapper it would need.
- A Playwright spec in `e2e/`. The browser run above was a one-off against a
  seeded instance, not a committed regression test.
- Preview of publication-system surfaces, which are gated behind cutover by
  [`PUBLICATION_SYSTEM.md`](PUBLICATION_SYSTEM.md).
- Member-gated rendering, so `members` and `paid` posts preview as staff see
  them rather than as a subscriber would.

## Open

- Whether autosave's abandoned-draft behaviour needs a periodic cleanup once
  real editors are working in the CMS.
- [`AGENTS.md`](../AGENTS.md) puts a safe migration first, and this is editor
  tooling rather than migration fidelity. It is inert for readers, but it is not
  cutover work.
