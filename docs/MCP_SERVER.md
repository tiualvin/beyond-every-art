# MCP server for Payload

## Summary

- **Status:** evaluation and architecture recommendation. Not approval to
  install the plugin or change the schema during migration or cutover.
- **Verdict:** viable, and the official route is the right one. Payload ships
  `@payloadcms/plugin-mcp`, and its published `3.86.0` release peer-depends on
  `payload@3.86.0` — the exact version this repository pins. A hand-written MCP
  server is not worth building.
- **What it would buy:** drafting posts and pages, reading and editing existing
  content, managing tags, authors, redirects, and site globals from Claude Code
  or Codex, through the same role-based access control the admin panel uses.
- **Blocking prerequisite:** the plugin adds a `payload-mcp-api-keys`
  collection, and this repository still has no Payload schema-migration
  workflow. See [Blocking prerequisite](#blocking-prerequisite-schema-migrations).
- **Second prerequisite:** `Posts.ghostID` and `Pages.ghostID` are
  `required: true`, so no agent — and no human — can create a genuinely new
  article without inventing a migration identifier. See
  [Finding 2](#finding-2-ghostid-blocks-authoring-new-articles).
- **Largest piece of real work:** the `content` field is Lexical. Auto-generated
  tools would make an LLM hand-write Lexical JSON. A custom markdown tool is the
  fix. See [Finding 3](#finding-3-lexical-bodies-need-a-markdown-tool).
- **Revisit when:** the cutover gates in
  [`docs/CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md) have passed. Until then this
  document stays a plan.

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
credentials, and — verified in the published `3.86.0` source — calls
`payload.create`, `payload.update`, and `payload.delete` with
`overrideAccess: false` and an explicit `user`.

The remaining argument for a custom server is workflow-shaped tools ("draft an
article from this outline"), and the plugin covers that too through
`defineTool` / `defineCollectionTool` without giving up the security model.

## How the plugin works

Verified against the published `@payloadcms/plugin-mcp@3.86.0` package rather
than the documentation, because the two disagree on the authorization header —
the docs describe Payload's generic `<collection> API-Key <key>` form, and the
shipped `3.86.0` endpoint reads a plain `Bearer` token.

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

### Blocking prerequisite: schema migrations

Installing the plugin adds a `payload-mcp-api-keys` table. This repository has
no `migrations/` directory, no `payload migrate` script in `package.json`, and
no migration step in the [`Dockerfile`](../Dockerfile) or
[`docker-compose.yml`](../docker-compose.yml) — the production container runs
`node server.js` and nothing else. The Postgres adapter only pushes schema
automatically outside production, so today there is no defined mechanism for a
new table to reach the production database.

This is the same gap already recorded in
[`docs/INSERTABLE_CONTENT_MODULES.md`](INSERTABLE_CONTENT_MODULES.md). It is not
caused by MCP and it is not MCP's to fix, but MCP cannot ship past a development
machine until it is fixed. Establishing the migration workflow is the first
piece of work, and it is worth doing on its own merits before any further schema
change lands.

### Finding 2: `ghostID` blocks authoring new articles

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

Until then, MCP authoring is realistically limited to editing existing migrated
documents.

### Finding 3: Lexical bodies need a markdown tool

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

This is the single highest-value custom piece, and it is the reason to reach for
`defineCollectionTool` rather than relying on the auto-generated CRUD alone.
Note that migrated posts render from `legacyHTML`, not `content`, so a
markdown-drafted body only appears on the public site for documents that have no
`legacyHTML` — which is exactly the newly authored ones.

### Finding 4: the endpoint is not behind the staging gate

[`middleware.ts`](../middleware.ts) excludes `api` from its matcher, so
`STAGING_BASIC_AUTH` does not protect `/api/mcp`. On a staging deployment the
endpoint would be reachable from the internet with the Bearer key as the only
control. That is a deliberate exclusion and correct for the REST API, but it
means the MCP endpoint's exposure has to be decided explicitly rather than
inherited:

- for the first phase, run it only against a local development server;
- when it does go to a deployed host, restrict `/api/mcp` at
  [`Caddyfile`](../Caddyfile) level — source IP, mTLS, or a tunnel — instead of
  relying on the key alone;
- keep `disabled: true` in production config until that is in place. The plugin
  keeps its collection when disabled precisely so the schema stays stable.

### Finding 5: edits are not attributable

Payload's version history records what changed and when, not who. With autosave
at 800ms on both `Posts` and `Pages`, an agent editing a document produces a
burst of versions indistinguishable from a human's. If more than one key exists,
or if an agent damages a document, there is no trail from the change back to the
key that made it.

Two cheap mitigations, in order of value:

1. a `beforeChange` hook on `Posts` and `Pages` that writes a structured log
   line when `req.payloadAPI === 'MCP'` — the plugin sets that value, and the
   observability helpers in [`lib/observability`](../lib/observability) already
   define the JSON log conventions to follow;
2. one key per agent and per purpose, labelled, so revocation is surgical.

### Finding 6: response size

Auto-generated `find` tools return whole documents, and a migrated post carries
its entire `legacyHTML` body. A handful of unbounded `findPosts` calls will fill
an agent's context with HTML nobody asked for. Configure the collection
descriptions to steer usage, instruct agents to pass `select`, and use the
plugin's `overrideResponse` hook on `posts` to strip `legacyHTML` from list
responses.

### Finding 7: publishing authority

Nothing in the plugin distinguishes "save a draft" from "publish to the public
internet" — an `update` tool call with `_status: 'published'` does the latter,
and an editor-bound key is permitted to make it. Publication is an editorial
decision that should stay with a human.

Recommended: enable `create` and `update` but set `delete: false` for `posts`
and `pages` in the plugin config, and add an `overrideResponse` or a collection
hook that refuses `_status: 'published'` transitions from `req.payloadAPI ===
'MCP'`. An agent drafts; a person presses publish in the admin panel, where Live
Preview shows them what they are publishing.

## Recommended shape

### Phase 0 — prerequisites (not MCP work)

1. Establish the Payload migration workflow: a `migrations/` directory, a
   `payload migrate` script, and a migration step in the container start
   command. Nothing else can ship until this exists.
2. Decide the `ghostID` relaxation and sequence it after the final Ghost import.

### Phase 1 — local, read and draft only

Add the plugin with a deliberately narrow config:

```ts
mcpPlugin({
  collections: {
    posts: {
      description: 'Articles. Bodies are Lexical; drafts only.',
      enabled: { create: true, delete: false, find: true, update: true },
    },
    tags: { enabled: { find: true } },
    authors: { enabled: { find: true } },
    media: { enabled: { find: true } },
  },
  disabled: process.env.MCP_ENABLED !== '1',
})
```

Create one API key bound to an `editor` user, labelled for the agent that holds
it. Verify with `npx @modelcontextprotocol/inspector` against
`http://127.0.0.1:3000/api/mcp` before wiring any client. Add `MCP_ENABLED` to
[`.env.example`](../.env.example) with a comment explaining that keys are per
person, never committed, and invalidated by a `PAYLOAD_SECRET` rotation.

### Phase 2 — make drafting actually good

Add the markdown tools from [Finding 3](#finding-3-lexical-bodies-need-a-markdown-tool),
the MCP audit log line from [Finding 5](#finding-5-edits-are-not-attributable),
and the publish guard from [Finding 7](#finding-7-publishing-authority). Unit
test the markdown conversion the way the rest of `lib/` is tested — round-trip
a fixture through `convertMarkdownToLexical` and `richTextToHtml` and assert the
rendered body, so a Lexical version bump cannot silently start producing empty
articles.

### Phase 3 — beyond drafting

Only after the cutover gates pass: `pages`, `redirects`, and the `site-settings`
/ `header` / `footer` globals, each bound to an admin key, plus a decision on
deployed exposure per [Finding 4](#finding-4-the-endpoint-is-not-behind-the-staging-gate).
`members`, `billing-events`, `newsletter-signups`, and `users` are out of scope
permanently: they hold personal and billing data, there is no editorial reason
for an agent to reach them, and the plugin's opt-in allowlist means excluding
them costs nothing.

## Client configuration

Both clients speak Streamable HTTP, so one endpoint serves both.

Claude Code — `.mcp.json`, with the key read from the environment, never
inline:

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

Codex — `~/.codex/config.toml` (or a project-scoped `.codex/config.toml`),
using `codex mcp add` or a `url` plus `bearer_token_env_var` entry.

`.mcp.json` is not currently in [`.gitignore`](../.gitignore). If a committed
config is wanted, it must reference the key by environment variable only; the
safer default is to leave client config out of the repository entirely.

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

## Open questions

1. Which role should the first key bind to — `editor` as recommended, or
   `admin` for globals and redirects work in the same session?
2. Should agent-initiated publishing be blocked outright, or allowed for a
   trusted admin key?
3. Does the MCP endpoint ever need to be reachable from outside the VPS, or is
   local-only against a development database sufficient?

## References

- [Payload MCP plugin documentation](https://payloadcms.com/docs/plugins/mcp)
- [`@payloadcms/plugin-mcp` on npm](https://www.npmjs.com/package/@payloadcms/plugin-mcp)
- [Payload API key authentication](https://payloadcms.com/docs/authentication/api-keys)
- [Payload Lexical markdown converters](https://payloadcms.com/docs/rich-text/converting-markdown)
- [Payload access control](https://payloadcms.com/docs/access-control/overview)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Codex MCP configuration](https://developers.openai.com/codex/mcp)
