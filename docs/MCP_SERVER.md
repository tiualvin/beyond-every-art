# MCP server for Payload

## Summary

- **Status:** Phase 1 is built and off by default. `MCP_ENABLED=1` mounts
  `POST /api/mcp`; without it the endpoint does not exist. The sections below
  are the evaluation it was built from, kept because the reasoning still governs
  what may be added next.
- **What it does:** drafts and revises articles from Claude Code, Codex, or the
  Claude mobile app, writing bodies in Markdown, through the same role-based
  access control the admin panel uses. It never publishes unless the key belongs
  to an administrator.
- **What it deliberately cannot reach:** `members`, `billing-events`,
  `newsletter-signups`, `users`, and every global. Deleting articles is off.
- **How to turn it on:** [What is built](#what-is-built).
- **OAuth is built.** The connector dialogs that cannot send a bearer header now
  have an authorization server to talk to — see
  [`MCP_OAUTH.md`](MCP_OAUTH.md). It is off by default and separate from
  `MCP_ENABLED`.
- **Still open:** the
  `ghostID` relaxation waits on the final Ghost import, though drafting no longer
  depends on it —
  [Finding 2](#finding-2-ghostid-blocks-authoring-new-articles--resolved). And
  no key carries an expiry or a last-used stamp —
  [Finding 10](#finding-10-key-lifecycle--open). Note that an _OAuth_ grant does
  expire, after ninety days — see [`MCP_OAUTH.md`](MCP_OAUTH.md); this is about
  the bearer API keys.
- **Unchanged constraint:** none of this may displace migration or cutover work.
  See [`docs/CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md).

## What is built

Configuration lives in [`lib/mcp/`](../lib/mcp): `plugin.ts` (allowlist, rate
limit, request logging), `tools.ts` (the drafting tools), `markdown.ts`
(Markdown ⇄ Lexical), `response.ts` (keeping bodies out of find responses),
`api-keys.ts` (who may issue and revoke a key), `errors.ts` (the shape of a
refusal), `publish-guard.ts`, `rate-limit.ts`, and `audit.ts`.

The endpoint itself is covered end to end by
[`e2e/mcp.spec.ts`](../e2e/mcp.spec.ts), which the `browser-smoke` CI job runs
against a seeded disposable database: it asserts that an unauthenticated call is
refused, that a key is offered the drafting tools and nothing outside the
allowlist, that a Markdown body survives the round trip, and that an editor key
is refused a publish. Everything else about MCP is unit-tested under
[`tests/mcp/`](../tests/mcp), but none of that can tell you the endpoint is
mounted.

### Turning it on

1. Apply migrations: `pnpm migrate:db`. The `payload-mcp-api-keys` table ships
   in `20260728_105928_add_mcp_api_keys`.
2. Set `MCP_ENABLED=1`. Unset, the plugin keeps its collection but mounts no
   endpoint, so the schema does not depend on the flag.
3. In Payload Admin, open **MCP → API Keys**, create a key, bind it to an
   **editor** user in the **User** field, tick the capabilities it needs, and
   copy the key once. Two details about that screen are worth knowing before
   you use it — see [Issuing and revoking keys](#issuing-and-revoking-keys).
4. Point a client at `https://<CMS_ADDRESS>/api/mcp` with
   `Authorization: Bearer <key>`.

Keys are encrypted with `PAYLOAD_SECRET`; rotating that secret invalidates every
key. Revoke one by deleting its document.

### Issuing and revoking keys

The plugin's own defaults on `payload-mcp-api-keys` made both halves of the
recommendation below impossible, and it took using the screen to notice. Its
`user` field refuses `create` and `update` outright, so a key always bound to
whoever made it — an administrator following step 3 could only ever mint an
admin-bound key, which is precisely the key
[Decision 1](#decisions-taken) says not to make, and one that may publish. And
`read`, `update`, and `delete` were all filtered to the requesting user's own
keys, so "revoke by deleting its document" was something only the key's holder
could do — backwards, since revocation matters most when that person is
unavailable or is the reason for it.

[`lib/mcp/api-keys.ts`](../lib/mcp/api-keys.ts) takes up the hook the plugin
provides for exactly this (`overrideApiKeyCollection`) and changes two things,
both access rules — no field moves, so the schema is untouched:

- an **administrator** may set **User** when creating a key, and may read,
  update, and delete anyone's. Everybody else still sees only their own, and
  their keys still bind to them.
- **rebinding stays refused for everyone, permanently.** Changing `user` on a
  live key does not change the key's secret, so the credential already sitting
  in an agent's configuration would silently begin acting as somebody else.
  Issue a new key and delete the old one; that is a revocation, and it is
  visible.

One more thing about that screen, because it runs the other way from the
collection checkboxes: **custom tools default to ticked.** `draftArticle`,
`readArticleMarkdown`, `updateArticleMarkdown`, and `uploadMedia` are all
enabled on a new key unless you untick them, while every collection capability
starts unticked. That is the plugin's default, not this project's choice.

### Tools

Generated by the plugin: `findPosts`, `createPosts`, `updatePosts`, `findTags`,
`findAuthors`, `findMedia`. Per-key checkboxes decide which of these a given key
actually sees — a key with `tags.update` unticked is not offered `updateTags` at
all.

Written for this project, because the generated ones cannot do the job:

| Tool                    | Does                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `draftArticle`          | Creates a post from Markdown, always as a draft. Mints the `ghostID`, resolves tag and author slugs, refuses unknown ones.             |
| `readArticleMarkdown`   | Reads a post back as Markdown, including the draft body. Says so plainly when the document renders from migrated `legacyHTML` instead. |
| `updateArticleMarkdown` | Replaces a body from Markdown, saved as a draft.                                                                                       |
| `uploadMedia`           | Adds an image to the Media library from base64 and returns its id, for `updatePosts` to set as a `featuredImage`.                      |
| `uploadMediaFromUrl`    | The same, from an https address the server fetches itself. The only one of the two that works from a phone or a scheduled run.         |

### Images

The generated `createMedia` tool cannot carry a file, so a Media document made
through it would have no image attached. `uploadMedia` takes the bytes directly:
the agent sends base64 — a data: URL is accepted — along with the `alt` text the
collection requires.

Nothing the caller says about the bytes is trusted. The format is read from the
file's own leading bytes rather than from a claimed MIME type or a filename
extension, the size is checked before the string is decoded so a long string
cannot make the server allocate against it, and the filename is rebuilt from
scratch so it cannot climb out of the media directory. PNG, JPEG and WebP are
accepted, to 8MB.

**SVG is refused.** `Media` itself allows `image/*`, which includes it, but an
SVG is a document that can carry script, and one served from the media host
would be a stored cross-site scripting vector. No image generator emits SVG, so
nothing is lost on this path; uploading one through the admin panel, where a
person chose the file, is unchanged.

**`uploadMedia` cannot be used from a chat client, and `uploadMediaFromUrl`
exists because of it.** Base64 arrives inside the tool call, which means the
bytes pass through the model's context: eight megabytes of image is roughly
eleven megabytes of text, which no connector will ever emit and no model should
be asked to. The base64 path is for a CLI agent that already holds the file. Any
client that has a _link_ to an image — which is every client that just generated
one — should use the URL tool instead.

That tool makes this server fetch an address its caller chose, which is the
classic server-side request forgery shape: the process sits inside a private
network with a database, containers reachable by name, and on some hosts a
metadata service that hands credentials to anything that asks.
[`lib/security/outbound-fetch.ts`](../lib/security/outbound-fetch.ts) is the
guard, and four things hold:

- **https only.** `file:`, `data:` and plain `http:` are refused rather than
  upgraded — anyone who can answer for a name on the local network can answer
  plaintext.
- **Every resolved address is checked, not the hostname.** A name is not an
  address: `localtest.me` resolves to `127.0.0.1`, and anybody can publish a
  record pointing anywhere. All answers are checked, so a name resolving to one
  public and one private address is refused rather than gambled on.
- **The checked address is the one connected to.** Validating a name and then
  handing the name to an HTTP client re-resolves it, and a DNS server under the
  caller's control can answer differently the second time. The address is pinned
  through a custom `lookup`; TLS still verifies against the hostname, so pinning
  costs no certificate checking.
- **Redirects are followed by hand**, three at most, each re-validated. A public
  first hop redirecting to a private second one is exactly what automatic
  following would have missed.

Nothing the response says about the bytes is trusted either. Both tools end at
the same `vetImageBytes`, which reads the format from the file's leading bytes —
a `Content-Type: image/png` on a downloaded SVG buys nothing.

Uploading is one call; attaching is the next one. Either tool returns the new
document's id, and `updatePosts` sets it as `featuredImage`.

That second call only works on a **draft**. Payload sends a document's existing
`_status` with every update, so an editor-bound key updating an already
published post trips `refuseMcpPublish` — the write carries
`_status: 'published'` even though it is not changing it, and the guard cannot
tell the difference. This is the guard working rather than a bug to route
around: an agent that could edit live articles is the thing it exists to
prevent, and illustrating one is still an edit to something readers are
looking at. Illustrate drafts over MCP; change a published article in the admin
panel.

Uploads are marked `aiGenerated` unless the call says otherwise. This
publication writes about specific works and materials, so which pictures are
synthetic has to stay an answerable question — the field is indexed and
filterable in the admin panel. Default-true is the deliberate direction to fail
in: an image wrongly marked as generated is a nuisance, one wrongly marked as a
photograph is a false claim about a work of art. Set `credit` as well when the
distinction should reach the reader rather than only an editor, because that is
the line the article page actually renders.

### Publishing, and one sharp edge

An editor-bound key cannot publish: `refuseMcpPublish` rejects any MCP write
that sets `_status: 'published'` unless the key's user is an administrator.
Everything that is not MCP — the admin panel, REST, GraphQL, seeds, the Ghost
importer — is untouched.

The sharp edge is Payload's, not this project's: publishing through `updatePosts`
publishes **the fields that call sends**, not the pending draft body. An admin
key that publishes a post whose draft was written by `updateArticleMarkdown`
will publish the older body and leave the revision sitting in the versions
table. Publish from the admin panel, where the draft is promoted and Live
Preview shows what is going out.

### What gets logged

Five JSON lines, alongside the existing `request_error`, `not_found`, and
`csp_violation` ones. Read them with `docker compose logs app | grep mcp_`.

| Line          | Written when               | Carries                                                       |
| ------------- | -------------------------- | ------------------------------------------------------------- |
| `mcp_auth`    | a request authenticates    | key label, user, role                                         |
| `mcp_refused` | a request is turned away   | reason (`rate_limited` / `unauthorized`), caller, retry-after |
| `mcp_request` | a JSON-RPC call completes  | method, tool name, duration, transport status                 |
| `mcp_write`   | a document is written      | collection, document, operation, resulting status, user, role |
| `mcp_error`   | the transport itself fails | message, context, source, severity                            |

Payload's version history records what changed, never who, and autosave makes an
agent's edits look like a person's — these lines are the only trail from a
change back to the key that made it.

Three things about them are worth knowing before reading a log:

**There is no session line, because there is no session.** An earlier version of
this document promised one line per MCP session. The endpoint is Streamable HTTP
with SSE disabled, which `mcp-handler` serves from a single stateless server
with no session id generator, and `overrideAuth` runs per request — so
`mcp_auth` is per request, and is named for what it is. `SESSION_STARTED` and
`SESSION_ENDED` are never emitted on this transport.

**`mcp_auth` and `mcp_request` describe the same request from two sides.**
`overrideAuth` knows the key and not the tool; the plugin's `onEvent` hook knows
the tool and not the key. Neither can be reduced to the other, so a normal tool
call writes two lines, plus a third if it wrote a document.

**`mcp_request` deliberately records almost nothing about the call.**
`mcp-handler` passes the _request body_ to `onEvent`, so the tool's arguments are
available there — an entire 8MB base64 image on an `uploadMedia` call, the full
text of an article on a drafting one. Only `params.name` is read. Note also that
its `status` comes from the transport, not the tool: a handler that throws is
caught by the MCP SDK and returned as a JSON-RPC error, which the transport
still completes successfully. A refused publish reads as `success` here;
`mcp_write` is what says whether anything landed.

Refusals are the reason `mcp_refused` exists at all. Both the rate limit and an
unrecognised key are rejected inside `overrideAuth`, before the MCP handler is
entered, so neither reaches `onEvent` — without that line, a run of guessed keys
against a publicly reachable endpoint left no evidence anywhere.

## Decision status

This document evaluates whether Beyond Every Art should expose Payload to
Claude Code and Codex over the Model Context Protocol, so that articles can be
drafted and parts of the backend operated from an agent instead of the admin
panel.

The recommended direction is:

1. adopt the official `@payloadcms/plugin-mcp` rather than writing a bespoke
   server;
2. gate it behind an explicit, small collection allowlist — never the whole
   config;
3. bind every MCP key to a real Payload user so the existing role rules in
   [`access/roles.ts`](../access/roles.ts) remain the only authority on what an
   agent may do;
4. add one custom tool that accepts markdown and converts it to Lexical
   server-side, because that is the difference between "an agent can draft
   articles" and "an agent can technically write JSON blobs"; and
5. run it locally against a development database first, and treat exposing the
   endpoint on the production host as a separate, later decision.

It does not recommend enabling the plugin's experimental tools, which write
TypeScript collection files and edit `payload.config.ts` on disk.

## Why the official plugin, and not a custom server

The obvious hand-rolled alternative is a small stdio MCP server that imports
`getPayloadClient()` from [`lib/payload.ts`](../lib/payload.ts) and exposes a
handful of tools over Payload's Local API. It was considered and rejected:

- The Local API defaults to `overrideAccess: true`. A custom server that forgets
  to pass `overrideAccess: false` and a `user` hands an LLM unconditional
  administrative authority over every collection — including `members` and
  `billing-events` — with no role check anywhere in the path. That is one
  missing option away from a data-protection incident, and nothing in the type
  system flags it.
- It would need `DATABASE_URI` and `PAYLOAD_SECRET` in the agent's environment,
  which means production database credentials sitting in a developer's MCP
  client config.
- Tool schemas would have to be written and maintained by hand for every field
  of every collection, and would drift from the Payload config silently.

The official plugin resolves all three: it derives tool schemas from the Payload
config, authenticates over HTTP with a scoped key instead of database
credentials, and — verified in the published `3.88.0` source — calls
`payload.create`, `payload.update`, and `payload.delete` with
`overrideAccess: false` and an explicit `user`.

The remaining argument for a custom server is workflow-shaped tools ("draft an
article from this outline"), and the plugin covers that too through
`defineTool` / `defineCollectionTool` without giving up the security model.

## How the plugin works

Verified against the published `@payloadcms/plugin-mcp@3.88.0` package rather
than the documentation, because the two disagree on the authorization header —
the docs describe Payload's generic `<collection> API-Key <key>` form, and the
shipped endpoint reads a plain `Bearer` token.

**Transport and endpoint.** The plugin registers `POST /api/mcp` and
`GET /api/mcp` as Payload endpoints, served through the existing
[`app/(payload)/api/[...slug]/route.ts`](<../app/(payload)/api/[...slug]/route.ts>)
catch-all. No new route file is needed. It is Streamable HTTP; the `GET` handler
exists only to answer `Method not allowed`, which is expected — clients use
`POST`. A stdio launcher (`npx payload-mcp`) also exists but does not hot-reload
and offers nothing this project needs, since both Claude Code and Codex speak
Streamable HTTP.

**Authentication.** The plugin adds a `payload-mcp-api-keys` collection with
`useAPIKey: true` and `disableLocalStrategy: true`. Each key document holds a
required `user` relationship into `users`, a label, a description, and a grid of
capability checkboxes. A request arrives as `Authorization: Bearer <key>`; the
endpoint HMAC-SHA256s the key with `payload.secret`, looks up the matching key
document, and runs the whole MCP session as that key's user with
`_strategy: 'mcp-api-key'`.

**Three independent gates.** Every MCP operation has to pass all three:

| Gate                                                     | Lives in                                | Who changes it                 |
| -------------------------------------------------------- | --------------------------------------- | ------------------------------ |
| Collection allowlist and per-operation `enabled` flags   | `payload.config.ts`                     | a developer, via a deploy      |
| Per-key capability checkboxes                            | the API Keys collection in admin        | an administrator, in real time |
| Payload access control (`overrideAccess: false`, `user`) | [`access/roles.ts`](../access/roles.ts) | already written                |

Nothing is exposed by default: `getEnabledSlugs` filters on the `collections`
map the plugin is configured with, so a collection that is not named is not
reachable. `members`, `billing-events`, `newsletter-signups`, and `users` stay
invisible unless someone deliberately lists them.

**Drafts.** `createResourceTool` and `updateResourceTool` both take a `draft`
boolean and pass it to Payload, so they compose correctly with the
`versions: { drafts: { autosave } }` config on `Posts` and `Pages`.

**Experimental tools.** The plugin can also expose tools that create collection
`.ts` files, rewrite `payload.config.ts`, define jobs, and perform auth
operations including `login`, `forgotPassword`, and `unlock`. They are disabled
by default, only surface when `NODE_ENV === 'development'`, and should stay off
here. `unlock` in particular runs with `overrideAccess: true`.

## Why it fits this repository's access model

Because the plugin runs as a real Payload user with access control on, the
existing role design does the security work unchanged. What an MCP key can do is
exactly what its user could do in the admin panel:

| Key bound to a… | Can                                                                | Cannot                                                         |
| --------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| `author`        | create posts, edit and delete posts they own that are still drafts | touch `pages`, `redirects`, globals, or another author's post  |
| `editor`        | manage posts, pages, tags, authors, media, redirects               | create users, read `members` or `billing-events`, edit globals |
| `admin`         | everything                                                         | —                                                              |

Two existing protections are worth naming because they survive intact:

- **`legacyHTML` stays editor-only.** The field carries `create` and `update`
  field access of `editorsAndAdminsField` on `Posts`, and
  [`toBodyHtml`](../lib/content/richtext.ts) hands it to
  `dangerouslySetInnerHTML`. Field access is enforced under
  `overrideAccess: false`, so an author-bound MCP key cannot use an agent to
  land stored XSS on the public site. An editor- or admin-bound key can — same
  as an editor with a browser. That is the trust decision already recorded in
  [`collections/Posts.ts`](../collections/Posts.ts), not a new one.
- **Gated posts stay gated.** `postsRead` keeps `members` and `paid` posts out
  of anonymous reads, and the MCP `find` tools inherit it.

The recommendation therefore is: **bind the first key to an `editor`, not an
`admin`.** Editorial work needs nothing more, and it removes `users`,
`members`, and the globals from the blast radius entirely.

## Findings

### Blocking prerequisite: schema migrations — resolved

Installing the plugin adds a `payload-mcp-api-keys` table, and when this
evaluation was written there was no mechanism for a new table to reach the
production database: no `migrations/` directory, no migrate script, and a
production container that runs `node server.js` and nothing else.

That gap — the same one recorded in
[`docs/INSERTABLE_CONTENT_MODULES.md`](INSERTABLE_CONTENT_MODULES.md) — has since
been closed. `push` is off in every environment, the schema is committed as SQL
under `migrations/`, the deploy applies pending migrations before it replaces
containers, and CI fails when a schema change arrives without one. See
[`docs/DATABASE_MIGRATIONS.md`](DATABASE_MIGRATIONS.md).

One operator action remains before any schema change deploys: the existing VPS
database was built by push and has to be baselined once, which is recorded as
item 0 in [`DEPLOYMENT_STATUS.md`](DEPLOYMENT_STATUS.md).

### Finding 2: `ghostID` blocks authoring new articles — resolved

`Posts.ghostID` and `Pages.ghostID` are both `required: true, unique: true`.
That is correct for the migration — it is the idempotent external identifier the
importer upserts on — but it means the create path for a _new_ article demands a
Ghost identifier that does not exist. An agent asked to draft an article today
must invent one, which quietly pollutes the field that
`pnpm migrate:validate` reconciles against.

This affects human authoring in the admin panel identically; MCP only makes it
obvious. The fix belongs to the collection, not the MCP layer: after the final
import, relax `required` to false — or default it to a clearly synthetic,
non-Ghost value — and update `scripts/validate-migration.ts` to ignore records
without one. That change must not happen before the final import, because
`required: true` is currently what guarantees every migrated document carries
its identifier.

The interim answer turned out to be better than expected, and needed no schema
change at all. `draftArticle` mints a namespaced synthetic identifier —
`native:<uuid>` — which satisfies the field without weakening it: it cannot
collide with a Ghost ObjectID, and `validateContent` in
[`lib/migration/validate.ts`](../lib/migration/validate.ts) keys on the IDs the
export actually contains, so an extra natively authored post produces no
validation issue. `isClean` checks issues, not counts. The prefix also makes
these documents greppable when the field is eventually relaxed.

So drafting works today. The relaxation is still worth doing after the final
import, but it is now a tidying task rather than a blocker.

### Finding 3: Lexical bodies need a markdown tool — built

The plugin derives its tool input schemas from `configToJSONSchema`. For a
`richText` field that yields the Lexical editor-state shape: a `root` object
with a `children` array of nodes carrying `type`, `version`, `format`, `indent`,
`direction`, and per-node extras. An LLM can produce that, but it is
token-expensive, easy to get subtly wrong, and a wrong `version` or a missing
`format` produces a document that saves cleanly and renders as an empty body.

`@payloadcms/richtext-lexical` exports `convertMarkdownToLexical` and
`convertLexicalToMarkdown`, with the editor config reachable through
`editorConfigFactory.fromField()`. One custom `defineCollectionTool` that takes
`{ title, slug, markdown, excerpt }`, converts server-side, and creates a draft
turns article drafting from "emit correct Lexical JSON" into "write the
article". A matching read tool that converts the stored body back to markdown
makes revision work equally cheap.

This was the single highest-value custom piece, and it is built —
[`lib/mcp/markdown.ts`](../lib/mcp/markdown.ts) and the three tools above. A
round trip through `convertMarkdownToLexical` and back preserves headings,
emphasis, lists, block quotes, and links.

One correction to the plan: **the plugin exports no `defineTool` or
`defineCollectionTool`** — not at `3.86.0`, where this was first written, and
still not at `3.88.0`, which the project now pins. Those helpers are documented
on Payload's main branch but have not shipped, so the tools are declared as
plain objects against the `mcp.tools` config type instead. Worth re-checking on
the next version bump: adopting the helpers is a refactor of
[`lib/mcp/tools.ts`](../lib/mcp/tools.ts), not a config change.

A second thing the plugin did not do, **fixed upstream since**: at `3.86.0` it
resolved the key's user, handed it to its own generated tools, and never put it
on the request. Custom tools receive only `req`, and so do collection hooks — so
the drafting tools ran anonymously and failed Posts' `authenticated` create
rule, while the publish guard and the audit log saw no role at all.
[`lib/mcp/plugin.ts`](../lib/mcp/plugin.ts) assigns `req.user` in `overrideAuth`
to close that. At `3.88.0` the plugin assigns it too, immediately after
`overrideAuth` returns, so the assignment here is now belt and braces rather
than load-bearing. It is kept: it costs nothing, it holds if that changes again,
and the audit line needs the user in hand anyway.

Note that migrated posts render from `legacyHTML`, not `content`, so a
markdown-drafted body only appears on the public site for documents that have no
`legacyHTML` — which is exactly the newly authored ones. `readArticleMarkdown`
says so rather than returning an empty string.

### Finding 4: the endpoint is not behind the staging gate

> **Read the second half first.** The three bullets below were the original
> conclusion and no longer hold — source IP, mTLS, and tunnels are all ruled out
> by the decision to support mobile clients, and `disabled: true` is no longer
> the standing instruction. They are kept because the reasoning that replaced
> them only makes sense against them.

[`middleware.ts`](../middleware.ts) excludes `api` from its matcher, so
`STAGING_BASIC_AUTH` does not protect `/api/mcp`. On a staging deployment the
endpoint would be reachable from the internet with the Bearer key as the only
control. That is a deliberate exclusion and correct for the REST API, but it
means the MCP endpoint's exposure has to be decided explicitly rather than
inherited:

- ~~for the first phase, run it only against a local development server;~~
- ~~when it does go to a deployed host, restrict `/api/mcp` at
  [`Caddyfile`](../Caddyfile) level — source IP, mTLS, or a tunnel — instead of
  relying on the key alone;~~
- ~~keep `disabled: true` in production config until that is in place.~~ The
  plugin keeps its collection when disabled precisely so the schema stays
  stable.

**Superseded in part by the mobile decision.** Source IP, mTLS, and tunnels all
assume the client connects. Mobile connectors do not: Anthropic's and OpenAI's
servers make the connection, from addresses that are shared and unpublished, and
they will not present a client certificate or join a tunnel. Choosing mobile
therefore rules out all three, and the bearer key becomes the credential. What
was built instead:

- `/api/mcp` is served **only on `CMS_ADDRESS`** — the public site's hostname
  returns 404 for it, so the address readers use exposes no write endpoint;
- an in-application fixed-window rate limit, because Caddy's standard build has
  no rate limiting and every request — including one with a wrong key — costs a
  database lookup before it can be rejected. 120 requests per key per minute,
  tunable with `RATE_LIMIT_MCP_PER_MINUTE` like the site's other limiters. It is
  keyed on the presented credential rather than a source address, because the
  requests arrive from a vendor's cloud and share addresses. A refusal answers
  429 and says how many seconds remain in the window, so an agent waits instead
  of retrying in a loop — neither of which was true when this was first written,
  see [Finding 8](#finding-8-refusals-answered-500-not-429--fixed);
- **a second limit on failed authentications, keyed by source address.** The
  limit above cannot bound key guessing, and reading it as though it could was a
  hole rather than a subtlety: it buckets on what the caller presents, and the
  caller chooses that, so every guess arrived in a fresh bucket with a full
  allowance of 120 and still bought the key lookup the limit exists to protect.
  A thousand guesses were a thousand lookups and a thousand tracked windows.
  Ten failures per address per fifteen minutes now bounds it
  (`RATE_LIMIT_MCP_AUTH_FAILURES`), counted only on failure, so a caller holding
  a working key never touches it however much traffic it sends. Addresses are
  shared between MCP callers, so a client looping on a revoked key can spend the
  budget for another caller behind the same address — accepted, because the cost
  is a second misconfigured client waiting fifteen minutes and the alternative is
  unlimited guessing against the endpoint's only credential;
- a ceiling on how many windows any limiter will track
  (`lib/security/rate-limit.ts`), for the same reason. A caller-chosen key space
  is a caller-chosen number of `Map` entries, and the eviction pass ran over
  every entry on every request, so a flood of distinct keys cost quadratic work
  on top of the memory. Keys past the ceiling share one overflow bucket and the
  sweep runs once per window;
- keys scoped per key in the admin panel, acting as a real Payload user, unable
  to publish unless that user is an administrator;
- `MCP_ENABLED` unset by default, so the endpoint exists only where someone
  decided it should.

### Finding 5: edits are not attributable — built

Payload's version history records what changed and when, not who. With autosave
at 800ms on both `Posts` and `Pages`, an agent editing a document produces a
burst of versions indistinguishable from a human's. If more than one key exists,
or if an agent damages a document, there is no trail from the change back to the
key that made it.

Two cheap mitigations, in order of value:

1. a hook on `Posts` and `Pages` that writes a structured log line when
   `req.payloadAPI === 'MCP'` — the plugin sets that value, and the
   observability helpers in [`lib/observability`](../lib/observability) already
   define the JSON log conventions to follow;
2. one key per agent and per purpose, labelled, so revocation is surgical.

The first is built as an `afterChange` hook rather than `beforeChange`, so the
line records what actually landed rather than what was attempted — see
[What gets logged](#what-gets-logged). The second is an operating habit, not
code: label each key for the client that holds it.

### Finding 6: response size — built

Auto-generated `find` tools return whole documents, and a migrated post carries
its entire `legacyHTML` body. A handful of unbounded `findPosts` calls will fill
an agent's context with HTML nobody asked for. Configure the collection
descriptions to steer usage, instruct agents to pass `select`, and use the
plugin's `overrideResponse` hook on `posts` to strip `legacyHTML` from list
responses.

Built as [`lib/mcp/response.ts`](../lib/mcp/response.ts), which covers `content`
as well as `legacyHTML` — both are article bodies, and the Lexical one is no
cheaper to carry. Each is replaced by a note giving its size and pointing at
`readArticleMarkdown`, so an agent can see that a body exists and ask for it
deliberately.

Two implementation notes, because the hook is easy to get wrong. The response
text arrives **already serialised** — the plugin has built its header and one
`json` block per document before `overrideResponse` sees it — and the second
argument is the paginated result on a list, a bare document on `findByID`,
`create`, and `update`, and `{}` on the error paths. So the elided response is
rebuilt from the documents rather than edited as a string: a search-and-replace
over the plugin's formatting would fail silently the first time that formatting
changed. And when no document carried a body — a `select`ed query, a natively
authored post with no `legacyHTML` — the plugin's own response is returned
untouched, so this narrows responses without ever reformatting them for its own
sake.

### Finding 7: publishing authority

Nothing in the plugin distinguishes "save a draft" from "publish to the public
internet" — an `update` tool call with `_status: 'published'` does the latter,
and an editor-bound key is permitted to make it. Publication is an editorial
decision that should stay with a human.

Recommended: enable `create` and `update` but set `delete: false` for `posts`
and `pages` in the plugin config, and add a collection hook that refuses
`_status: 'published'` transitions from `req.payloadAPI === 'MCP'`. An agent
drafts; a person presses publish in the admin panel, where Live Preview shows
them what they are publishing.

Decided otherwise in part — see [Decisions taken](#decisions-taken): the refusal
is conditional on role, so an admin-bound key may publish while the editor key
may not.

### Finding 8: refusals answered 500, not 429 — fixed

A refusal written inside `overrideAuth` does not reach the caller the way it
reads at the throw site. Payload's `routeError` takes the HTTP status off the
error's own `status` property and falls back to 500, and then, unless the error
is marked public, throws the message away and substitutes
`Something went wrong.`:

```js
let status = err.status || httpStatus.INTERNAL_SERVER_ERROR
if (!isErrorPublic(err, config))
  response = formatErrors(new APIError('Something went wrong.'))
```

Both rate-limit refusals threw a plain `Error`, which carries neither property.
So the sentence this document promised — "a refusal says how many seconds remain
in the window, so an agent waits instead of retrying in a loop" — was not true of
anything the caller received: it got `500 Something went wrong.` and no seconds
at all. That is the worst available answer for an unattended client, because 500
is exactly the status a client retries immediately and 429 is the one it backs
off from.

[`lib/mcp/errors.ts`](../lib/mcp/errors.ts) now throws `APIError`s with a real
status and `isPublic: true`, so the text survives the trip. Nothing else changes:
a tool that throws is caught by the MCP SDK and returned as a JSON-RPC error, and
that path was always fine — which is why the publish guard's message always
arrived and these never did.

`Retry-After` is still not set, because Payload builds the response from the
error and a thrown error cannot carry headers. The seconds are in the message,
which is the part an agent reads.

### Finding 9: `GET /api/mcp` spent the guessing budget — fixed

The plugin registers `GET` alongside `POST` and routes it through the whole
authentication path, only to have `mcp-handler` answer `Method not allowed`
inside an HTTP 200. Every unauthenticated `GET` therefore cost a key lookup and,
worse, counted against the failed-authentication budget — which is keyed by
source address, and MCP callers arrive from a vendor's shared cloud. A crawler,
a client probing for an SSE stream, or a connector validating a URL could spend
another caller's allowance.

`overrideAuth` now refuses `GET` before any limiter or lookup runs, with a 405 —
which is also what the transport spec asks of a server that offers no SSE stream
at the endpoint, so clients get a clearer answer than they did.

### Finding 10: key lifecycle — open

An MCP key is a standing credential that will sit in Anthropic's or OpenAI's
cloud indefinitely, and the key document holds a label, a description, a user,
and capability checkboxes. It holds no expiry and no last-used stamp. Two
consequences, neither urgent and both real:

- a dormant key is indistinguishable from an active one, so there is no way to
  tell which of several keys is still in use before revoking it;
- nothing expires on its own, so a key outlives the client that held it unless
  somebody remembers it exists.

The fix is small in code and awkward in sequencing: `overrideApiKeyCollection`
already gives a clean place to add `lastUsedAt` and `expiresAt` fields
([`lib/mcp/api-keys.ts`](../lib/mcp/api-keys.ts) is that hook), and
`overrideAuth` already resolves the key document, so writing the stamp and
checking the expiry costs one update per authenticated request. But adding
fields is a schema change, so it needs a migration generated against a live
database — see [`DATABASE_MIGRATIONS.md`](DATABASE_MIGRATIONS.md) — and CI fails
a schema change that arrives without one. Sequence it with the next migration.

Until then, the operating habit in
[Finding 5](#finding-5-edits-are-not-attributable--built) is what stands in for
it: one key per client, labelled for the client that holds it.

### Finding 11: nothing watches the refusals — built

`mcp_refused` with `reason: unauthorized` is the line that says somebody is
guessing at the endpoint's only credential, and the only way it reached a person
was `docker compose logs app | grep mcp_`, typed by someone who already suspected
something. The evidence existed and the alarm did not.

[`lib/observability/alert.ts`](../lib/observability/alert.ts) closes it. Ten
failed authentications from one address inside five minutes posts once to
`ALERT_WEBHOOK_URL`, then stays quiet for fifteen minutes — an alarm that repeats
is an alarm that gets muted. Unset the variable and nothing is sent and no
outbound request is ever made, which is the default.

The threshold sits just under the rate limiter's own (ten failures per address
per fifteen minutes), so the refusal and the notice arrive together rather than
the refusal arriving alone. No credential is in the body: the refusal line
already truncates a presented key, and an alert ends up in a chat room.

## Recommended shape

### Phase 0 — prerequisites (not MCP work)

1. ~~Establish the Payload migration workflow.~~ Done — see
   [`DATABASE_MIGRATIONS.md`](DATABASE_MIGRATIONS.md). The remaining operator
   step is baselining the existing VPS database, item 0 in
   [`DEPLOYMENT_STATUS.md`](DEPLOYMENT_STATUS.md).
2. Decide the `ghostID` relaxation and sequence it after the final Ghost import.

### Phases 1 and 2 — built

The narrow allowlist, the markdown drafting tools, the publish guard, the audit
log, and the rate limit all shipped together rather than in two passes; there was
no useful intermediate state where drafting existed but could not be trusted.
See [What is built](#what-is-built) for what they are and how to switch them on.

Verified end to end against a live server before merging: an unauthenticated
request is refused, a wrong key is refused, a key sees only the tools its
checkboxes allow, a Markdown body survives the round trip through Lexical, an
editor key is refused a publish and an administrator key is granted one, and a
collection that is not in the allowlist has no tool at all.

### Phase 3 — beyond drafting

Only after the cutover gates pass: `pages`, `redirects`, and the `site-settings`
/ `header` / `footer` globals, each bound to an admin key. Note that adding
`pages` is a decision to take in two places — the plugin's collection allowlist
and the markdown tools, which are posts-only for the same reason, so that the
allowlist never understates the real surface.
`members`, `billing-events`, `newsletter-signups`, and `users` are out of scope
permanently: they hold personal and billing data, there is no editorial reason
for an agent to reach them, and the plugin's opt-in allowlist means excluding
them costs nothing.

## Client configuration

Every client here speaks Streamable HTTP, so one endpoint serves them all. What
differs is how they authenticate, and that is what decides which ones work
today.

### Claude Code

`.mcp.json`, with the key read from the environment, never inline:

```json
{
  "mcpServers": {
    "payload": {
      "type": "http",
      "url": "http://127.0.0.1:3000/api/mcp",
      "headers": { "Authorization": "Bearer ${PAYLOAD_MCP_KEY}" }
    }
  }
}
```

`.mcp.json` is not in [`.gitignore`](../.gitignore). If a committed config is
wanted it must reference the key by environment variable only; the safer default
is to leave client config out of the repository entirely.

### Codex

`~/.codex/config.toml`, or a project-scoped `.codex/config.toml`, via
`codex mcp add` or a `url` plus `bearer_token_env_var` entry.

### Claude mobile and web

Two routes, and which one you need depends on what the connector dialog offers.

**If it has a Request headers section** (a beta, rolled out per account): point
a custom connector at `https://<CMS_ADDRESS>/api/mcp` and put the key there as
`Authorization: Bearer <key>`. Simplest, and no OAuth involved.

**If it only offers OAuth Client ID and Client Secret** — which is what most
accounts see — leave both fields empty and let the connector register itself.
That works because the OAuth layer exists now; see
[`MCP_OAUTH.md`](MCP_OAUTH.md). Do not paste an API key into the client secret
field: it is not a place for one, and the dialog will reject a secret with no
matching id.

Worth understanding: the connection is made by Anthropic's servers, not by the
phone. That is why the endpoint has to be publicly reachable, and why it cannot
be restricted by source IP, client certificate, or tunnel —
[Finding 4](#finding-4-the-endpoint-is-not-behind-the-staging-gate).

**Two client-side defects are worth knowing before relying on a schedule**, both
upstream and neither fixable here:

- a custom connector configured with request-header auth has been reported to
  ignore the header and start an OAuth flow against the server's origin instead,
  using the header's _name_ as the `client_id`
  ([`anthropics/claude-ai-mcp#644`](https://github.com/anthropics/claude-ai-mcp/issues/644)).
  Against this endpoint that fails as a 401, because there is no authorization
  server to answer it.
- cloud scheduled tasks have been reported not to load MCP connectors at all
  until a human message lands in the session
  ([`anthropics/claude-code#43397`](https://github.com/anthropics/claude-code/issues/43397),
  and others). The workaround people have found is to write the scheduled prompt
  so it delegates the work to a subagent, which does get its tools initialised.

Both mean an unattended schedule wants one supervised run before it is trusted.
Neither is a reason to change anything in this repository.

### ChatGPT

Settings → Apps → Advanced → Developer mode, then Connectors → Create. Its
dialog offers three authentication modes — none, API key, and OAuth — so either
credential works: paste a key in the API-key mode, or choose OAuth and let it
register itself against [`MCP_OAUTH.md`](MCP_OAUTH.md).

Two things worth knowing while testing. Keys belong in a header, never a URL
query parameter, which ChatGPT's safety screening flags. And a connector has to
be re-enabled per conversation, which is a common reason a working connector
looks broken.

This section previously said ChatGPT was out of reach because it required OAuth
and none existed. Both halves of that have since stopped being true.

## Risks and non-goals

- **This is not migration work.** It does not help the Ghost cutover, and under
  [`AGENTS.md`](../AGENTS.md) it must not displace it. Everything here waits.
- **An MCP key is a standing credential.** It is a long-lived grant of a
  Payload user's authority to whatever process holds it. Scope it to an editor,
  label it, and revoke by deleting the key document.
- **Prompt injection reaches content.** An agent that reads a migrated post and
  then writes one is carrying attacker-controllable text between two Payload
  operations. Keeping `legacyHTML` editor-only, refusing agent-initiated
  publishing, and requiring a human to press publish are what contain that.
- **Not a mobile or public API.** This endpoint is a staff tool. The handoff's
  rule stands: future clients get secured network APIs, never administrative
  credentials.

## Decisions taken

1. **Key role: `editor`.** The first key binds to an editor user. Admin-bound
   keys are a later, separate decision.
2. **Publishing: draft-only for the editor key, permitted for a trusted admin
   key.** So the guard in [Finding 7](#finding-7-publishing-authority) is not a
   blanket refusal of `_status: 'published'` from MCP; it is conditional on the
   key's user being an admin. Implement it as a `beforeChange` hook that
   rejects a draft→published transition when `req.payloadAPI === 'MCP'` and
   `req.user.role !== 'admin'`, so the check lives with the collection rather
   than with the plugin config. Note the consequence honestly: whoever holds the
   admin key can publish to the live site through an agent, and the containment
   for prompt injection then rests on that key not being used for
   read-then-write work over untrusted content.
3. **Exposure: deployed, restricted at the reverse proxy.** The endpoint is
   reachable on the VPS rather than local-only. Hetzner is already the host —
   [`DEPLOYMENT_STATUS.md`](DEPLOYMENT_STATUS.md) records the VPS as provisioned
   there with Docker Compose, Caddy, and a working deploy on merge to `main`, so
   nothing about the hosting needs to change. What has to be added is the
   restriction in [Finding 4](#finding-4-the-endpoint-is-not-behind-the-staging-gate):
   `/api/mcp` gated in the [`Caddyfile`](../Caddyfile) by source IP, mTLS, or a
   tunnel, because `middleware.ts` excludes `/api` and `STAGING_BASIC_AUTH` will
   not cover it. Until that gate exists, keep the plugin disabled in production
   and work against a local database.

Still open: the `ghostID` relaxation in
[Finding 2](#finding-2-ghostid-blocks-authoring-new-articles), which cannot be
decided until the final Ghost import is done.

## References

- [Payload MCP plugin documentation](https://payloadcms.com/docs/plugins/mcp)
- [`@payloadcms/plugin-mcp` on npm](https://www.npmjs.com/package/@payloadcms/plugin-mcp)
- [Payload API key authentication](https://payloadcms.com/docs/authentication/api-keys)
- [Payload Lexical markdown converters](https://payloadcms.com/docs/rich-text/converting-markdown)
- [Payload access control](https://payloadcms.com/docs/access-control/overview)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Codex MCP configuration](https://developers.openai.com/codex/mcp)
